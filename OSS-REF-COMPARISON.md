# OSS-REF vs Inspect: Comprehensive Comparison

**50 Reference Projects Analyzed** | **Date:** April 8, 2026

---

## Executive Summary

This document compares all 50 OSS-REF (Open Source Reference) projects against Inspect's current capabilities. The goal is to identify:

- Features Inspect should adopt
- Architectural patterns to learn from
- Competitive gaps to fill

### Key Insight

**Inspect is positioned as a terminal-first AI testing tool**, similar to `expect` but with a focus on git-change-driven test generation. Many OSS-REF projects offer complementary features that could enhance Inspect.

---

## Category 1: AI-Powered Browser Automation (Direct Competitors/Complements)

| Project               | Language   | Core Value                                                   | vs Inspect                 | Priority  |
| --------------------- | ---------- | ------------------------------------------------------------ | -------------------------- | --------- |
| **skyvern**           | Python     | LLM + CV browser automation with `act/extract` APIs          | ❌ Superior AI integration | 🔴 High   |
| **stagehand**         | TypeScript | AI browser framework with `act/observe/extract` + caching    | ❌ Better caching/replay   | 🔴 High   |
| **browser-use**       | Python     | Autonomous web agent with tool system                        | ❌ More mature agent loop  | 🟡 Medium |
| **HyperAgent**        | TypeScript | Playwright + AI with `page.ai()`, MCP client, action caching | ❌ CDP-first, MCP ready    | 🔴 High   |
| **browser-agent**     | TypeScript | Vision-first automation with pixel coordinates               | ⚠️ Different approach      | 🟢 Low    |
| **browserable**       | TypeScript | Cloud browser automation platform                            | ⚠️ Infrastructure play     | 🟢 Low    |
| **page-agent**        | TypeScript | Page-level AI agent                                          | ⚠️ Overlapping concept     | 🟡 Medium |
| **testzeus-hercules** | Python     | AI test automation framework                                 | ⚠️ Similar goals           | 🟡 Medium |
| **TheAgenticBrowser** | TypeScript | Agentic browser interface                                    | ⚠️ Early stage             | 🟢 Low    |
| **vibium**            | Unknown    | AI automation (needs exploration)                            | ❓ Unknown                 | 🟢 Low    |

### What Inspect Should Learn

From **Skyvern**:

```python
# Natural language action API
await page.act("click the login button")
await page.extract("get all product prices")
await page.validate("is the user logged in?")
```

From **Stagehand**:

```typescript
// Observe-Act pattern with caching
const observations = await stagehand.observe("find the submit button");
await stagehand.act(observations[0]); // Deterministic replay
const data = await stagehand.extract({ schema: ProductSchema });
```

From **HyperAgent**:

```typescript
// AI-enhanced Playwright
await page.ai("search for flights from NYC to LA");
await page.perform("click the search button");
const result = await page.extract("get flight options", z.object({...}));
// Action caching for deterministic replay
```

---

## Category 2: Browser Automation Foundations (Core Dependencies)

| Project         | Purpose                    | Inspect Usage         | Status           |
| --------------- | -------------------------- | --------------------- | ---------------- |
| **playwright**  | Cross-browser automation   | ✅ Core foundation    | ✅ Excellent     |
| **puppeteer**   | Chrome DevTools Protocol   | ⚠️ CDP concepts       | ✅ Sufficient    |
| **selenium**    | WebDriver standard         | ❌ Not used           | ⚠️ Could extend  |
| **cypress**     | E2E testing framework      | ❌ Different approach | 🟡 Learn from UX |
| **nightwatch**  | E2E testing framework      | ❌ Not used           | 🟢 Low priority  |
| **webdriverio** | Next-gen automation        | ❌ Not used           | 🟢 Low priority  |
| **testcafe**    | E2E testing                | ❌ Not used           | 🟢 Low priority  |
| **nightmare**   | Electron-based automation  | ❌ Deprecated         | ❌ Ignore        |
| **splinter**    | Python browser abstraction | ❌ Not used           | 🟢 Low priority  |

### What Inspect Should Learn

From **Cypress**:

- Time-travel debugging (DOM snapshots)
- Real-time test reloads
- Automatic waiting (no explicit sleeps)
- Excellent developer experience

From **Playwright**:

- Already using, but could leverage more:
  - Trace viewer for debugging
  - Codegen from user actions
  - Network interception

---

## Category 3: AI Agent Frameworks (Orchestration Patterns)

| Project                  | Language  | Purpose                      | Value for Inspect     |
| ------------------------ | --------- | ---------------------------- | --------------------- |
| **langchain**            | Python/TS | LLM application framework    | Tool calling patterns |
| **langgraph**            | Python/TS | Agent workflow orchestration | Multi-agent patterns  |
| **AutoGPT**              | Python    | Autonomous agent loops       | Goal decomposition    |
| **autogen**              | Python    | Multi-agent conversation     | Human-in-the-loop     |
| **openai-agents-python** | Python    | Agent handoffs               | Safety guardrails     |
| **semantic-kernel**      | Python/C# | AI development SDK           | Plugin architecture   |
| **agent-browser**        | Unknown   | Agent browser interface      | Pattern reference     |
| **katalon-agent**        | Unknown   | Test agent                   | Similar domain        |

### What Inspect Should Learn

From **autogen**:

- Multi-agent test scenarios (security agent, a11y agent, performance agent)
- Human approval checkpoints
- Group chat patterns for consensus

From **AutoGPT**:

- Agent memory persistence
- Goal-oriented test execution
- Self-hosting capabilities

---

## Category 4: Testing Frameworks & Tools

| Project                | Purpose                              | Inspect Overlap          | Priority    |
| ---------------------- | ------------------------------------ | ------------------------ | ----------- |
| **expect**             | AI browser testing for coding agents | ⚠️ **Direct competitor** | 🔴 Critical |
| **jest**               | JavaScript testing                   | ⚠️ Different layer       | 🟢 Low      |
| **vitest**             | Vite-native testing                  | ⚠️ Different layer       | 🟢 Low      |
| **mocha**              | JS test framework                    | ⚠️ Different layer       | 🟢 Low      |
| **lighthouse**         | Performance auditing                 | ✅ Integrated            | ✅ Good     |
| **crawlee**            | Web scraping                         | ⚠️ Overlap               | 🟡 Medium   |
| **scrapy**             | Python scraping                      | ❌ Not used              | 🟢 Low      |
| **msw**                | API mocking                          | ⚠️ Could use             | 🟡 Medium   |
| **json-server**        | Mock API server                      | ⚠️ Test fixtures         | 🟡 Medium   |
| **puppeteer-recorder** | Session recording                    | ❌ Deprecated            | ❌ Ignore   |

### What Inspect Should Learn

From **expect** (Primary Competitor):

```bash
# Similar workflow - key differentiator analysis
/expect              # Their entry point
inspect test         # Our entry point

# Features to match:
- rrweb session recording ✅ (just implemented)
- Cookie extraction from browser profiles
- GitHub Actions integration
- Multi-agent support (Claude, Codex, etc.)
```

---

## Category 5: Infrastructure & Dev Tools

| Project         | Purpose                        | Value for Inspect                |
| --------------- | ------------------------------ | -------------------------------- |
| **e2b**         | Sandboxed code execution       | 🔴 Sandboxed test execution      |
| **uffizzi**     | Ephemeral preview environments | 🟡 Test environment provisioning |
| **apify-cli**   | Web scraping platform          | 🟢 Alternative approach          |
| **shopify-cli** | CLI framework patterns         | 🟡 CLI UX patterns               |
| **composio**    | Tool integration framework     | 🟡 Tool ecosystem                |
| **next.js**     | React framework                | ⚠️ Used for web UI               |
| **astro**       | Web framework                  | ⚠️ Alternative to Next           |
| **vercel**      | Deployment platform            | ⚠️ Infrastructure                |

### What Inspect Should Learn

From **e2b**:

```python
# Sandboxed test execution
@sandbox()
async def run_test(browser: Browser):
    # Safe, isolated execution
    agent = Agent(task="test checkout flow", browser=browser)
    await agent.run()
```

---

## Category 6: Specialized Tools

| Project               | Category         | Value                        |
| --------------------- | ---------------- | ---------------------------- |
| **axios**             | HTTP client      | ⚠️ Already have alternatives |
| **gpt-engineer**      | Code generation  | 🟡 Test file generation      |
| **docsgpt**           | Documentation AI | 🟢 Docs automation           |
| **aichat**            | Chat interface   | 🟢 UI pattern                |
| **awesome-ai-agents** | Resource list    | 📚 Reference only            |
| **JuMP.jl**           | Optimization     | ❌ Not relevant              |
| **Matrix**            | Communication    | ❌ Not relevant              |
| **sauce-docs**        | Documentation    | 🟢 Docs patterns             |

---

## Category 7: Cloud/Enterprise Platforms

| Project         | Type             | Notes               |
| --------------- | ---------------- | ------------------- |
| **HyperAgent**  | AI browser agent | Has cloud offering  |
| **browserable** | Cloud automation | Infrastructure play |
| **skyvern**     | AI automation    | Cloud + open source |
| **expect**      | Testing service  | FSL-1.1-MIT license |

---

## Detailed Feature Gap Analysis

### 🔴 Critical Gaps (High Priority)

| Feature                       | Status in Inspect         | OSS-REF Source             | Implementation Path                          |
| ----------------------------- | ------------------------- | -------------------------- | -------------------------------------------- |
| **Session Recording (rrweb)** | 🟡 Partial (just started) | expect, rrweb              | Complete integration with HTML replay export |
| **Self-Healing Selectors**    | ❌ None                   | skyvern, stagehand         | Semantic matching + fallback strategies      |
| **Natural Language Actions**  | ❌ None                   | skyvern, HyperAgent        | `act/extract/observe` API layer              |
| **Action Caching**            | ❌ None                   | stagehand, HyperAgent      | Cache LLM outputs for deterministic replay   |
| **MCP Server**                | ❌ None                   | playwright-mcp, HyperAgent | Expose tools via Model Context Protocol      |

### 🟡 Medium Gaps (Medium Priority)

| Feature                       | Status     | Source           | Notes                            |
| ----------------------------- | ---------- | ---------------- | -------------------------------- |
| **Multi-Agent Orchestration** | ⚠️ Partial | autogen, AutoGPT | Specialized agents per test type |
| **Human-in-the-Loop**         | ❌ None    | autogen          | Approval checkpoints             |
| **Sandboxed Execution**       | ❌ None    | e2b              | Safe test code execution         |
| **Workflow Recording**        | ❌ None    | browser-use      | Record → Generate test           |
| **Visual Test Builder**       | ❌ None    | langflow         | No-code/low-code interface       |

### 🟢 Low Priority / Research

| Feature                          | Status  | Source        |
| -------------------------------- | ------- | ------------- |
| **Pixel-Coordinate Interaction** | ❌ None | browser-agent |
| **WebDriver Protocol**           | ❌ None | selenium      |
| **Component Testing**            | ❌ None | cypress       |
| **Time-Travel Debugging**        | ❌ None | cypress       |

---

## Architecture Comparison

### Inspect Current Architecture

```
CLI (Ink TUI) → Orchestrator → Agent → Playwright → Browser
                    ↓
              Git Changes
                    ↓
              Test Plan Generation
```

### Recommended Evolution (from OSS-REF patterns)

```
CLI (Ink TUI) → Orchestrator → Agent Loop → Playwright → Browser
                    ↓              ↓
              Git Changes    Action Cache
                    ↓              ↓
              Test Plan    Deterministic Replay
                    ↓
              Session Recording (rrweb)
                    ↓
              Human Checkpoints
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (0-4 weeks)

1. ✅ **Complete rrweb integration** (already started)
   - Session recording on failures
   - HTML replay export
   - Integration with test reports

2. **Natural Language Action API**
   ```typescript
   // Add to orchestrator
   await agent.act("click the login button");
   await agent.extract("get all product prices");
   ```

### Phase 2: Core AI Features (1-3 months)

3. **Self-Healing Selectors**
   - Semantic element matching
   - DOM change detection
   - Auto-selector regeneration

4. **Action Caching**
   - Cache successful natural language → Playwright translations
   - Deterministic replay without LLM calls

5. **MCP Server**
   - Expose Inspect tools via Model Context Protocol
   - Allow external agents to use Inspect

### Phase 3: Advanced Features (3-6 months)

6. **Multi-Agent Support**
   - Security testing agent
   - Accessibility testing agent
   - Performance testing agent

7. **Human-in-the-Loop**
   - Approval checkpoints for critical actions
   - Override agent decisions

8. **Workflow Recording**
   - Record user browser sessions
   - Generate test scripts automatically

---

## Competitive Positioning

### Inspect vs expect (Primary Competitor)

| Feature             | Inspect       | expect      |
| ------------------- | ------------- | ----------- |
| Git change scanning | ✅            | ✅          |
| AI test generation  | ✅            | ✅          |
| Session recording   | 🟡 (building) | ✅          |
| Multi-agent support | ❌            | ✅          |
| Cookie extraction   | ❌            | ✅          |
| CI/CD integration   | ❌            | ✅          |
| Open Source         | ✅            | FSL-1.1-MIT |

**Differentiation Opportunity:**

- Open source (Inspect) vs Source-available (expect)
- Terminal-native experience
- Extensible agent architecture

### Inspect vs Skyvern/Stagehand/HyperAgent

| Feature                  | Inspect | AI Agents |
| ------------------------ | ------- | --------- |
| Natural language control | ❌      | ✅✅✅    |
| Self-healing selectors   | ❌      | ✅✅      |
| Action caching           | ❌      | ✅✅      |
| Git integration          | ✅      | ❌        |
| Terminal TUI             | ✅      | ❌        |
| Session recording        | 🟡      | ⚠️        |

**Differentiation:**

- Inspect: Git-driven, terminal-native, developer workflow
- AI Agents: General-purpose automation, cloud-first

---

## Recommendations

### Immediate Actions

1. **Complete rrweb integration** (in progress)
   - Finish recording adapter
   - Add HTML replay generation
   - Integrate with test failure reports

2. **Study stagehand caching**
   - Implement action cache layer
   - Enable deterministic replay

3. **Research skyvern selector healing**
   - Design semantic matching system
   - Plan DOM change detection

### Strategic Investments

4. **Natural Language API**
   - Design `act/extract/observe` interface
   - Integrate with existing orchestrator

5. **MCP Server**
   - Expose Inspect capabilities
   - Join AI agent ecosystem

6. **Multi-Agent Architecture**
   - Modular agent system
   - Specialized testing agents

---

## Appendix: All 50 OSS-REF Projects

### AI-Powered Browser Automation (9)

1. skyvern - LLM + CV browser automation
2. stagehand - AI browser framework
3. browser-use - Autonomous web agent
4. HyperAgent - Playwright + AI
5. browser-agent - Vision-first automation
6. browserable - Cloud browser platform
7. page-agent - Page-level AI agent
8. testzeus-hercules - AI test automation
9. TheAgenticBrowser - Agentic browser interface
10. vibium - AI automation

### Browser Automation Foundations (9)

11. playwright - Core automation (✅ Using)
12. puppeteer - CDP automation
13. selenium - WebDriver standard
14. cypress - E2E testing framework
15. nightwatch - E2E testing
16. webdriverio - Next-gen automation
17. testcafe - E2E testing
18. nightmare - Electron automation (deprecated)
19. splinter - Python browser abstraction

### AI Agent Frameworks (8)

20. langchain - LLM framework
21. langgraph - Agent workflows
22. AutoGPT - Autonomous agents
23. autogen - Multi-agent conversations
24. openai-agents-python - Agent handoffs
25. semantic-kernel - AI SDK
26. agent-browser - Agent interface
27. katalon-agent - Test agent

### Testing & Quality (10)

28. expect - AI browser testing (⚠️ Competitor)
29. jest - JS testing
30. vitest - Vite testing
31. mocha - JS testing
32. lighthouse - Performance (✅ Integrated)
33. crawlee - Web scraping
34. scrapy - Python scraping
35. msw - API mocking
36. json-server - Mock APIs
37. puppeteer-recorder - Recording (deprecated)

### Infrastructure & Dev Tools (8)

38. e2b - Sandboxed execution
39. uffizzi - Preview environments
40. apify-cli - Scraping platform
41. shopify-cli - CLI patterns
42. composio - Tool integration
43. next.js - Web framework
44. astro - Web framework
45. vercel - Deployment

### Specialized Tools (7)

46. axios - HTTP client
47. gpt-engineer - Code generation
48. docsgpt - Documentation AI
49. aichat - Chat interface
50. awesome-ai-agents - Resource list

---

_Generated for Inspect project analysis_
