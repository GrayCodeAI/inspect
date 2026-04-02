# OSS-REF Feature Analysis

**Purpose:** Analyze all 26 reference projects to extract features, patterns, and capabilities worth considering for Inspect.

**Last Updated:** April 2, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Matrix](#feature-matrix)
3. [Detailed Analysis by Category](#detailed-analysis-by-category)
4. [Features to Consider for Inspect](#features-to-consider-for-inspect)
5. [Architecture Patterns](#architecture-patterns)
6. [Integration Opportunities](#integration-opportunities)

---

## Executive Summary

The OSS-REF collection contains 26 projects spanning:

- **AI Agent Frameworks** (5)
- **Browser Automation** (5)
- **LLM Orchestration** (4)
- **Testing & Quality** (4)
- **Infrastructure** (4)
- **Educational Resources** (3)
- **Protocols** (1)

**Total Lines of Code:** ~3.6 GB of reference implementations

---

## Feature Matrix

### Core Capabilities

| Feature                          | Projects                                       | Inspect Status           |
| -------------------------------- | ---------------------------------------------- | ------------------------ |
| Natural Language Browser Control | browser-use, browser-agent, skyvern, stagehand | ✅ Core feature          |
| Vision-Based Automation          | skyvern, OpAgent, browser-agent                | ✅ Implemented           |
| Multi-Agent Orchestration        | AutoGPT, autogen, openai-agents-python         | ⚠️ Partial               |
| Accessibility Tree Navigation    | playwright-mcp, axe-core                       | ✅ Implemented           |
| Session Recording                | rrweb                                          | ❌ Not implemented       |
| Performance Auditing             | lighthouse                                     | ✅ Implemented           |
| Security Scanning                | -                                              | ✅ Custom implementation |
| Code Generation                  | gpt-engineer                                   | ⚠️ Partial (test gen)    |
| Visual Regression                | -                                              | ✅ Implemented           |
| CI/CD Integration                | qawolf, expect                                 | ✅ Implemented           |

---

## Detailed Analysis by Category

### 1. AI Agent Frameworks

#### AutoGPT (337M)

**Key Features:**

- Autonomous agent loops with goal decomposition
- Self-hosting capabilities
- Memory management (short & long-term)
- Plugin system for extensibility
- Continuous agent deployment

**For Inspect:**

- Agent memory persistence
- Goal-oriented test execution
- Plugin architecture for custom tools

---

#### autogen (76M)

**Key Features:**

- Multi-agent conversation orchestration
- Human-in-the-loop support
- Code execution agents
- Group chat patterns
- Custom agent roles

**For Inspect:**

- Multi-agent test scenarios
- Human approval checkpoints
- Specialized agent roles (security, a11y, performance)

---

#### openai-agents-python (15M)

**Key Features:**

- Agent handoffs between specialists
- Guardrails and safety controls
- Tool calling with structured outputs
- Tracing and observability
- Workflow orchestration

**For Inspect:**

- Agent specialization (different agents for different test types)
- Comprehensive tracing
- Safety guardrails for autonomous actions

---

#### OpAgent (977M)

**Key Features:**

- Vision-based web navigation
- DOM understanding without selectors
- Autonomous task completion
- Screenshot analysis

**For Inspect:**

- Already implemented in Inspect's vision service
- Alternative approach to DOM parsing

---

#### skyvern (800M)

**Key Features:**

- LLM + Computer Vision browser automation
- Playwright-compatible SDK
- No XPath/CSS selectors needed
- Workflow recording and replay
- Self-healing selectors

**For Inspect:**

- Self-healing test selectors
- Workflow recording from user sessions
- Vision-first approach validation

---

### 2. Browser Automation

#### playwright (106M)

**Key Features:**

- Cross-browser support (Chromium, Firefox, WebKit)
- Auto-waiting and retry mechanisms
- Network interception and mocking
- Tracing and debugging tools
- Codegen from user actions
- Accessibility tree snapshots

**For Inspect:**

- Core foundation already used
- Tracing integration opportunities
- Codegen for test creation

---

#### browser-use (14M)

**Key Features:**

- Natural language action parsing
- LLM-based action planning
- Browser state representation for LLMs
- Action verification and retry

**For Inspect:**

- Natural language test step parsing
- Action verification patterns

---

#### browser-agent / magnitude (22M)

**Key Features:**

- Pixel coordinate-based interaction
- Vision-first architecture
- Zod schema extraction
- Test runner with visual assertions
- MCP server integration

**For Inspect:**

- Alternative to DOM-based interaction
- Structured extraction patterns
- MCP protocol adoption

---

#### stagehand (84M)

**Key Features:**

- "Vibe coding" for browser automation
- Natural language to Playwright code
- AI-enhanced Playwright primitives
- Observe-Act-Extract pattern

**For Inspect:**

- Already similar to Inspect's architecture
- Code generation from natural language

---

#### expect (97M)

**Key Features:**

- AI-powered browser testing
- Logged-in user simulation
- No manual Playwright script writing
- CI/CD integration

**For Inspect:**

- Direct competitor/comparable
- CI integration patterns
- Test result reporting

---

### 3. LLM Orchestration

#### langchain (58M)

**Key Features:**

- Composable LLM components
- Chain and agent patterns
- Memory implementations
- Tool integration
- Document loaders

**For Inspect:**

- Tool calling architecture
- Memory for long test suites
- Document processing for test data

---

#### langflow (297M)

**Key Features:**

- Visual workflow builder
- Drag-and-drop LLM chains
- API generation from flows
- Component marketplace

**For Inspect:**

- Visual test builder opportunity
- Workflow-based test composition

---

#### gpt-engineer (32M)

**Key Features:**

- Natural language to code generation
- Iterative refinement
- Project scaffolding
- Code review and improvement

**For Inspect:**

- Test file generation from descriptions
- Self-healing test code

---

#### gpt-crawler (632K)

**Key Features:**

- Website crawling for GPT knowledge
- Structured output generation
- Custom GPT creation helper

**For Inspect:**

- Test data extraction from docs
- Site map generation

---

### 4. Testing & Quality

#### axe-core (22M)

**Key Features:**

- WCAG accessibility rules engine
- Custom rule creation
- Browser and Node.js support
- Integration APIs

**For Inspect:**

- Already integrated via @inspect/a11y
- Custom accessibility rule patterns

---

#### lighthouse (276M)

**Key Features:**

- Performance scoring
- Core Web Vitals measurement
- PWA auditing
- Accessibility audits
- SEO checks

**For Inspect:**

- Already integrated via @inspect/lighthouse-quality
- Custom audit creation patterns

---

#### qawolf (68M)

**Key Features:**

- Zero-effort test creation
- Playwright test maintenance
- Team collaboration features
- Test scheduling and runs

**For Inspect:**

- Test maintenance automation
- Team collaboration features

---

#### rrweb (19M)

**Key Features:**

- Session recording and replay
- DOM mutation recording
- Player component
- Event serialization

**For Inspect:**

- Test failure recording
- Session replay for debugging
- User journey recording

---

### 5. Infrastructure & Dev Tools

#### e2b (8.4M) + e2b-cookbook (35M)

**Key Features:**

- Secure code execution sandboxes
- AI-generated code running
- Filesystem and process management
- Template environments

**For Inspect:**

- Safe test code execution
- Isolated test environments
- Custom test runner sandboxes

---

#### uffizzi (5.3M)

**Key Features:**

- Ephemeral preview environments
- Docker Compose support
- Kubernetes integration
- GitHub/GitLab integration

**For Inspect:**

- Test environment provisioning
- Preview deployments for testing

---

#### LibreChat (39M)

**Key Features:**

- Multi-provider LLM interface
- Conversation management
- Plugin system
- User authentication
- Admin dashboard

**For Inspect:**

- Web UI for test management
- Multi-provider LLM support (already have)
- Conversation history for test sessions

---

### 6. Educational Resources

#### anthropic-quickstarts / anthropic-quickstarts-new (9M each)

**Key Features:**

- Customer support agents
- Financial analysis tools
- Computer use demos
- Autonomous coding agents

**For Inspect:**

- Example use cases
- Pattern documentation

---

#### courses (202M)

**Key Features:**

- API fundamentals course
- Prompt engineering guide
- Tool use tutorials
- Embeddings and RAG

**For Inspect:**

- Documentation inspiration
- Tutorial patterns

---

### 7. Protocols

#### playwright-mcp (924K)

**Key Features:**

- Model Context Protocol server
- Browser automation via MCP
- Accessibility tree snapshots
- Tool definitions for LLMs

**For Inspect:**

- MCP server implementation (already have @inspect/mcp)
- Tool definition patterns

---

## Features to Consider for Inspect

### High Priority

| Feature                   | Source               | Value  | Effort |
| ------------------------- | -------------------- | ------ | ------ |
| Session Recording (rrweb) | rrweb                | High   | Medium |
| Visual Test Builder       | langflow             | High   | High   |
| Self-Healing Selectors    | skyvern              | High   | Medium |
| Workflow Recording        | skyvern, browser-use | High   | Medium |
| Sandboxed Test Execution  | e2b                  | Medium | High   |

### Medium Priority

| Feature                    | Source               | Value  | Effort |
| -------------------------- | -------------------- | ------ | ------ |
| Multi-Agent Test Scenarios | autogen              | Medium | Medium |
| Human-in-the-Loop          | autogen              | Medium | Low    |
| Visual Workflow Builder    | langflow             | Medium | High   |
| Agent Specialization       | openai-agents-python | Medium | Medium |
| Ephemeral Environments     | uffizzi              | Medium | Medium |

### Low Priority / Research

| Feature                      | Source        | Notes                     |
| ---------------------------- | ------------- | ------------------------- |
| Pixel-Coordinate Interaction | browser-agent | Alternative to DOM-based  |
| Vibe Coding Interface        | stagehand     | Natural language code gen |
| Zero-Effort Test Creation    | qawolf        | Record and auto-maintain  |
| Component Marketplace        | langflow      | Plugin ecosystem          |

---

## Architecture Patterns

### 1. Agent Patterns

```
AutoGPT Pattern:
User Goal → Decompose → Execute → Observe → Reflect → Loop

autogen Pattern:
Orchestrator Agent → Specialist Agents → Group Chat → Consensus

openai-agents-python Pattern:
Agent A → Handoff → Agent B → Guardrail Check → Complete
```

**For Inspect:** Consider agent specialization per test type

### 2. Browser Automation Patterns

```
playwright-mcp Pattern:
Page → Accessibility Tree → LLM Context → Action Decision

skyvern Pattern:
Screenshot → Vision LLM → Pixel Coordinates → Execute

browser-use Pattern:
Natural Language → Action Parser → Playwright → Verify
```

**For Inspect:** Hybrid approach already implemented

### 3. Memory Patterns

```
AutoGPT Memory:
Short-term (context) → Long-term (vector DB) → Working (scratchpad)

langchain Memory:
Buffer → Summary → Vector Store → Entity Extraction
```

**For Inspect:** Consider for long test suites

---

## Integration Opportunities

### Immediate (Low Effort)

1. **rrweb Integration**
   - Add session recording to test failures
   - Replay user sessions for debugging

2. **Human-in-the-Loop**
   - Approval checkpoints for critical actions
   - Override agent decisions

### Short-term (Medium Effort)

3. **Self-Healing Selectors**
   - Detect DOM changes
   - Auto-update selectors based on semantic similarity

4. **Workflow Recording**
   - Record user sessions
   - Generate test scripts automatically

### Long-term (High Effort)

5. **Visual Test Builder**
   - Drag-and-drop test composition
   - No-code/low-code interface

6. **Sandboxed Execution**
   - Isolated test environments
   - Safe code execution for custom tests

---

## Feature Comparison: Inspect vs OSS-REF

| Capability         | Inspect    | Best in OSS-REF | Gap    |
| ------------------ | ---------- | --------------- | ------ |
| Browser Automation | ⭐⭐⭐⭐⭐ | Playwright      | None   |
| AI Test Generation | ⭐⭐⭐⭐   | stagehand       | Minor  |
| Session Recording  | ⭐         | rrweb           | Major  |
| Multi-Agent        | ⭐⭐       | autogen         | Medium |
| Visual Builder     | ⭐         | langflow        | Major  |
| Self-Healing       | ⭐⭐       | skyvern         | Medium |
| Sandbox Execution  | ⭐         | e2b             | Major  |
| CI/CD Integration  | ⭐⭐⭐⭐⭐ | qawolf          | None   |

---

## Recommendations

### Phase 1: Quick Wins

1. Integrate rrweb for session recording
2. Add human-in-the-loop checkpoints
3. Implement basic workflow recording

### Phase 2: Differentiation

4. Self-healing selectors
5. Visual test builder (MVP)
6. Enhanced multi-agent support

### Phase 3: Platform

7. Sandboxed test execution
8. Plugin marketplace
9. Advanced workflow orchestration

---

## References

- All projects located in `/home/lpatel/Code/LP-DEV/OSS-REF/`
- Total projects analyzed: 26
- Analysis date: April 2, 2026
