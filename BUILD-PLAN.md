# Inspect — Detailed Build Plan v3.0
### Created: March 28, 2026
### Based on: Future of AI Research + Actual Project State Analysis

---

## What Already Exists (Don't Rebuild)

The project is more advanced than ROADMAP-100/200 suggest. These are **already implemented**:

| Feature | Location | Status |
|---------|----------|--------|
| 28-agent 3-tier orchestrator | `apps/cli/src/agents/orchestrator.ts` | ✅ Done |
| Loop detection + replanning | `packages/agent/src/loop/` | ✅ Done |
| Action cache + self-healing | `packages/agent/src/cache/` | ✅ Done |
| Memory (short/long/compaction) | `packages/agent/src/memory/` | ✅ Done |
| 6 watchdogs (captcha, crash, DOM, downloads, popups, permissions) | `packages/agent/src/watchdogs/` | ✅ Done |
| Judge LLM + NL assertions | `packages/agent/src/tools/judge.ts` | ✅ Done |
| Tool registry + decorators + custom tools | `packages/agent/src/tools/` | ✅ Done |
| Speculative planner | `packages/core/src/orchestrator/speculative.ts` | ✅ Done |
| Recovery manager (5 strategies) | `packages/core/src/orchestrator/recovery.ts` | ✅ Done |
| Checkpoint manager (crash recovery) | `packages/core/src/orchestrator/checkpoint.ts` | ✅ Done |
| Sensitive data masking | `packages/agent/src/tools/` | ✅ Done |
| LLM retry + fallback + rate limiting | `packages/agent/src/providers/` | ✅ Done |
| Token budget enforcement | `apps/cli/src/agents/` | ✅ Done |
| ACP client (remote agent comm) | `packages/agent/src/acp/client.ts` | ✅ Done |
| CAPTCHA swarm (multi-agent) | `packages/services/src/services/captcha-swarm.ts` | ✅ Done |
| 15-block YAML workflow engine | `packages/workflow/` | ✅ Done |
| Service registry + gateway + message bus | `packages/services/src/` | ✅ Done |
| 8 benchmarks (MiniWoB, WebArena, etc.) | `evals/` | ✅ Done |
| 5 LLM providers + router + aliases | `packages/agent/src/providers/` | ✅ Done |
| OTP/2FA support | `packages/agent/src/otp/` | ✅ Done |
| Credential vault | `packages/credentials/` | ✅ Done |

---

## Real Gaps (What to Actually Build)

### Analysis Method
Compared against:
1. **2026 AI trends**: agentic orchestration, governance, local-first, world models
2. **Competitors**: browser-use, Stagehand, Skyvern, LaVague, Steel Browser
3. **Enterprise requirements**: compliance, audit, multi-tenancy, scale
4. **Developer experience**: onboarding, debugging, reliability

---

## PHASE 0: Integration Wiring (2 weeks) — CRITICAL PREREQUISITE
**Why**: Components exist in isolation. No wiring = dead code. Must fix before building new features.

### 0.1 Wire Core Executor to CLI Agents
- `TestExecutor.generatePlan()` is a stub returning hardcoded 6-step plan
- `TestExecutor.runStep()` records fake tool calls without real browser actions
- Recovery executors (scrollIntoView, dismissOverlay, refreshPage) are no-ops
- **Fix**: Make `TestExecutor` delegate to the real 28-agent system in `apps/cli/agents/orchestrator.ts`

### 0.2 Wire Services to Infrastructure
- None of the 9 services register with `ServiceRegistry`
- None subscribe to `MessageBus`
- None expose routes through `ApiGateway`
- **Fix**: Create `ServiceBootstrap` that wires all services to registry + bus + gateway

### 0.3 Wire Workflow Executor to Block Classes
- Executor has inline implementations duplicating all 15 block classes
- Block classes exported but never used
- 4 "world-class" blocks (crawl, track, proxy, benchmark) not in dispatch
- **Fix**: Refactor `executeBlockByType()` to delegate to `TaskBlock.execute()`, `CodeBlock.execute()`, etc.

### 0.4 Wire Lightpanda Backend to BrowserManager
- `LightpandaBackend` exists but `BrowserManager` only supports Chromium
- `BrowserBackend` interface uses `unknown` types
- **Fix**: Create `BrowserBackendAdapter` wrapping `LightpandaBackend` for `BrowserManager`

### 0.5 Fix Duplicate ActionCache
- Two separate implementations (`cache/store.ts` and `cache/action-cache.ts`)
- Different APIs, both exported with aliases
- **Fix**: Merge into single canonical implementation

### 0.6 Fix Incomplete Implementations
- `drag` action is a no-op in `tester.ts`
- Multi-device parallelism stubbed in `test.ts`
- Safari cookie extraction stub
- Benchmark block returns random numbers
- **Fix**: Implement or properly document as unsupported

**Tests: 15+ tests for integration wiring**

---

## PHASE 1: Agent Governance & Observability (4 weeks)
**Why**: EU AI Act enforcement Aug 2026. Zero tools exist for this. First-mover advantage.

### 1.1 Agent Audit Trail System

```
packages/agent/src/governance/
├── audit-trail.ts          # Immutable audit log
├── decision-logger.ts      # Log every LLM decision with reasoning
├── permission-manager.ts   # Agent permission scopes
├── autonomy-levels.ts      # Augmentation → Automation → Autonomy spectrum
└── governance.test.ts
```

**Implementation Details:**

```typescript
// audit-trail.ts
interface AuditEntry {
  id: string;                    // UUID
  timestamp: number;             // Date.now()
  agentId: string;               // Which agent
  sessionId: string;             // Which test run
  action: 'llm_call' | 'tool_use' | 'navigation' | 'form_fill' | 'assertion';
  input: string;                 // What was sent to LLM
  output: string;                // What LLM decided
  reasoning?: string;            // Extended thinking / chain-of-thought
  toolCalls: ToolCall[];         // Tools invoked
  tokenUsage: TokenUsage;        // Tokens consumed
  cost: number;                  // USD cost
  duration: number;              // ms
  result: 'success' | 'failure' | 'partial';
  metadata: Record<string, unknown>;
}

class AuditTrail {
  constructor(private storagePath: string) {}
  
  async log(entry: AuditEntry): Promise<void>  // Append-only, immutable
  async query(filter: AuditFilter): Promise<AuditEntry[]>
  async export(format: 'json' | 'csv' | 'junit'): Promise<string>
  async generateComplianceReport(standard: 'eu-ai-act' | 'soc2' | 'iso27001'): Promise<Report>
  async getHashChain(): Promise<string[]>  // Tamper-evident chain
}
```

**Key features:**
- Append-only file storage (`.inspect/audit/`)
- SHA-256 hash chain for tamper detection
- Queryable by agent, session, action type, time range
- Export to JSON/CSV/JUnit for compliance teams
- Pre-built compliance report templates (EU AI Act, SOC2)

### 1.2 Graduated Autonomy Levels

```typescript
// autonomy-levels.ts
enum AutonomyLevel {
  AUGMENTATION = 1,    // Agent suggests, human approves every action
  SUPERVISION = 2,     // Agent acts, human monitors, can intervene
  DELEGATION = 3,      // Agent acts independently, reports results
  AUTONOMY = 4         // Agent acts independently, only reports failures
}

interface AutonomyConfig {
  level: AutonomyLevel;
  maxCostPerSession: number;      // USD limit
  maxStepsPerSession: number;     // Step limit
  requireApprovalFor: Action[];   // Actions needing human OK
  autoEscalate: {
    onFailureCount: number;        // Escalate after N failures
    onCostThreshold: number;       // Escalate at $X
    onSensitiveAction: boolean;    // Always escalate for sensitive actions
  };
}
```

### 1.3 Permission Scopes

```typescript
// permission-manager.ts
interface AgentPermissions {
  allowedDomains: string[];       // Domain restriction
  blockedDomains: string[];       // Explicit blocks
  allowedActions: ActionType[];   // Can perform these actions
  blockedActions: ActionType[];   // Cannot perform these
  maxFileUploadSize: number;      // bytes
  allowFormSubmission: boolean;
  allowNavigation: boolean;
  allowJavaScript: boolean;
  allowDownloads: boolean;
  allowCookies: boolean;
}
```

### 1.4 Compliance Dashboard Page

Add to `apps/web/`:
- New page: `/governance`
- Real-time audit trail viewer
- Autonomy level controls
- Permission editor
- Compliance report generator
- Cost attribution per agent/session

### 1.5 CLI Commands

```bash
inspect audit                    # Show audit trail for last run
inspect audit --session <id>     # Show specific session
inspect audit --export csv       # Export audit trail
inspect audit --compliance eu    # Generate EU AI Act report
inspect permissions set <scope>  # Set agent permissions
inspect permissions show         # Show current permissions
```

**Tests: 25+ tests covering:**
- Audit entry creation and immutability
- Hash chain integrity verification
- Autonomy level transitions
- Permission enforcement (blocked actions rejected)
- Compliance report generation
- Export formats

---

## PHASE 2: True Multi-Agent Orchestration (5 weeks)
**Why**: Current orchestrator is sequential pipeline. Future is DAG-based agent graphs with dynamic spawning.

### 2.1 Agent Graph Engine

```
packages/agent/src/orchestration/
├── graph.ts                # DAG-based agent graph
├── node.ts                 # Agent node definition
├── edge.ts                 # Edge with conditions
├── scheduler.ts            # Parallel execution scheduler
├── message-bus-adapter.ts  # Connect to services/message-bus
├── state-machine.ts        # Agent state transitions
└── orchestration.test.ts
```

**Implementation Details:**

```typescript
// graph.ts
interface AgentNode {
  id: string;
  name: string;
  agent: Agent;                    // The agent implementation
  inputs: Port[];                  // Data inputs from other nodes
  outputs: Port[];                 // Data outputs to other nodes
  config: {
    maxSteps: number;
    timeout: number;
    retries: number;
    costBudget: number;
  };
  condition?: (state: GraphState) => boolean;  // Conditional execution
}

interface AgentEdge {
  from: string;                    // Source node ID
  to: string;                      // Target node ID
  condition?: (output: any) => boolean;  // Conditional routing
  transform?: (output: any) => any;      // Data transformation
}

class AgentGraph {
  addNode(node: AgentNode): void
  addEdge(edge: AgentEdge): void
  addParallel(nodeIds: string[]): void      // Execute in parallel
  addFanOut(sourceId: string, targetIds: string[]): void  // One → many
  addFanIn(sourceIds: string[], targetId: string): void   // Many → one
  
  async execute(initialState: GraphState): Promise<GraphResult>
  async executeWithVisualization(initialState: GraphState, callback: (event: GraphEvent) => void): Promise<GraphResult>
  
  validate(): GraphValidationResult  // Check for cycles, unreachable nodes
  toJSON(): SerializedGraph
  static fromJSON(json: SerializedGraph): AgentGraph
}
```

**Example graph:**
```
                    ┌─────────┐
                    │ Crawler │
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Planner  │ │ Analyzer │ │ Security │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └──────────┬─┘────────────┘
                        ▼
                  ┌───────────┐
                  │ Navigator │
                  └─────┬─────┘
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
        ┌─────────┐ ┌────────┐ ┌─────────┐
        │ Tester  │ │ A11y   │ │ Perf    │
        └────┬────┘ └───┬────┘ └────┬────┘
             │          │           │
             └─────┬────┘───────────┘
                   ▼
             ┌──────────┐
             │ Reporter │
             └──────────┘
```

### 2.2 Dynamic Agent Spawning

```typescript
// Dynamic agents created at runtime based on page content
interface AgentFactory {
  createFromContext(context: AgentContext): Agent;
  registerTemplate(name: string, factory: (config: any) => Agent): void;
  getAvailableTemplates(): string[];
}

// Example: discover a form → spawn FormTester agent
// Example: discover API endpoints → spawn APITester agent
// Example: discover complex UI → spawn VisualTester agent
```

### 2.3 Agent-to-Agent Communication via Message Bus

Wire the existing `MessageBus` to agent coordination:

```typescript
// In orchestration/node.ts
class AgentNodeExecutor {
  constructor(private messageBus: MessageBus) {
    this.messageBus.subscribe(`agent:${this.nodeId}:input`, this.handleInput);
  }
  
  async execute(input: AgentInput): Promise<AgentOutput> {
    // Run agent
    const result = await this.agent.run(input);
    // Publish output for downstream agents
    this.messageBus.publish(`agent:${this.nodeId}:output`, result);
    return result;
  }
}
```

### 2.4 CLI Command

```bash
inspect orchestrate --graph graphs/full-audit.yaml    # Run agent graph
inspect orchestrate --visualize                       # Show graph execution in TUI
```

**Tests: 30+ tests covering:**
- Graph validation (cycles, unreachable nodes)
- Parallel execution correctness
- Fan-out/fan-in patterns
- Conditional routing
- Dynamic agent spawning
- Message bus integration

---

## PHASE 3: Enterprise Local-First Deployment (4 weeks)
**Why**: Privacy regulations + API costs. Self-hosted AI is the fastest-growing trend (OpenClaw 339k stars).

### 3.1 Enterprise Local Runtime

```
packages/enterprise/
├── local-runtime.ts        # Ollama + vLLM management
├── model-marketplace.ts    # Model catalog with quality scoring
├── fleet-manager.ts        # Multi-device agent fleet
├── sso.ts                  # SAML/OIDC integration
├── rbac.ts                 # Role-based access control
├── tenant.ts               # Multi-tenancy
└── enterprise.test.ts
```

**Implementation Details:**

```typescript
// local-runtime.ts
interface LocalRuntimeConfig {
  provider: 'ollama' | 'vllm' | 'llamacpp';
  models: ModelConfig[];
  gpuAllocation: 'auto' | number;    // GPU memory allocation
  maxConcurrent: number;             // Max parallel inference
  fallbackToCloud: boolean;          // Auto-fallback when local overloaded
  cloudProvider: 'anthropic' | 'openai' | 'gemini';
}

class LocalRuntime {
  async start(): Promise<void>
  async stop(): Promise<void>
  async pullModel(name: string, onProgress: (pct: number) => void): Promise<void>
  async listModels(): Promise<LocalModel[]>
  async healthCheck(): Promise<RuntimeHealth>
  async benchmark(model: string): Promise<ModelBenchmark>  // Tokens/sec, latency
}
```

### 3.2 Model Marketplace

```typescript
// model-marketplace.ts
interface ModelListing {
  name: string;
  provider: 'ollama' | 'huggingface';
  parameters: string;              // "7B", "13B", "70B"
  quality: {
    browserTesting: number;        // 0-100 score
    codeGeneration: number;
    reasoning: number;
    vision: number;
  };
  requirements: {
    minVRAM: string;               // "8GB", "16GB"
    minRAM: string;
    supportedPlatforms: string[];  // "linux", "macos", "windows"
  };
  benchmarks: {
    tokensPerSecond: number;
    firstTokenLatency: number;
    costPer1kTokens: number;       // $0 for local
  };
}

class ModelMarketplace {
  async search(filter: ModelFilter): Promise<ModelListing[]>
  async recommend(requirements: UseCaseRequirements): Promise<ModelListing[]>
  async install(name: string): Promise<void>
  async rate(name: string, score: number): Promise<void>
}
```

### 3.3 SSO + RBAC

```typescript
// sso.ts
interface SSOConfig {
  provider: 'saml' | 'oidc' | 'azure-ad' | 'okta';
  entityId: string;
  ssoUrl: string;
  certificate: string;
  callbackUrl: string;
}

// rbac.ts
enum Role {
  VIEWER = 'viewer',           // Can view reports
  TESTER = 'tester',           // Can run tests
  ADMIN = 'admin',             // Can manage config
  SECURITY = 'security',       // Can run security scans
  SUPER_ADMIN = 'super_admin'  // Full access
}

interface RBACPolicy {
  role: Role;
  permissions: Permission[];
  allowedCommands: string[];       // CLI commands accessible
  allowedProviders: string[];      // LLM providers usable
  maxConcurrentTests: number;
  costBudget: number;              // Monthly USD budget
}
```

### 3.4 Multi-Tenancy

```typescript
// tenant.ts
interface Tenant {
  id: string;
  name: string;
  plan: 'free' | 'team' | 'enterprise';
  config: TenantConfig;
  users: TenantUser[];
  usage: {
    testsRun: number;
    tokensUsed: number;
    costIncurred: number;
    period: { start: Date; end: Date };
  };
}

class TenantManager {
  async createTenant(config: CreateTenantInput): Promise<Tenant>
  async getTenant(id: string): Promise<Tenant>
  async updateConfig(id: string, config: Partial<TenantConfig>): Promise<void>
  async enforceQuotas(tenantId: string): Promise<QuotaStatus>
}
```

### 3.5 Hybrid Routing

```typescript
// Routes sensitive tasks to local, complex to cloud
class HybridRouter {
  async route(task: AgentTask): Promise<LLMProvider> {
    if (task.containsSensitiveData && this.localRuntime.isHealthy()) {
      return this.localRuntime.getProvider();
    }
    if (task.requiresVision && !this.localRuntime.supportsVision()) {
      return this.cloudProvider;
    }
    if (this.localRuntime.load < 0.8) {
      return this.localRuntime.getProvider();  // Save costs
    }
    return this.cloudProvider;  // Fallback
  }
}
```

### 3.6 CLI Commands

```bash
inspect enterprise setup                    # Interactive enterprise setup
inspect enterprise models                   # List available local models
inspect enterprise models install llama3.1  # Install a model
inspect enterprise status                   # Health check
inspect enterprise sso configure            # SSO setup wizard
inspect enterprise rbac set-role <user> <role>  # Set user role
inspect enterprise tenants create           # Create tenant
inspect enterprise usage                    # Show usage/billing
```

**Tests: 25+ tests covering:**
- Local runtime lifecycle
- Model marketplace search/install
- SSO flow (mock IdP)
- RBAC permission enforcement
- Tenant isolation
- Hybrid routing decisions

---

## PHASE 4: Self-Healing & Autonomous Test Generation (4 weeks)
**Why**: The competitive moat. Tests that fix themselves. Tests that create themselves.

### 4.1 Self-Healing Test Engine

```
packages/core/src/healing/
├── healer.ts               # Main healing orchestrator
├── selector-resolver.ts    # Smart selector resolution
├── dom-differ.ts           # DOM change detection
├── healing-strategies.ts   # 8 healing strategies
├── learning.ts             # Learn from successful heals
└── healing.test.ts
```

**8 Healing Strategies:**

```typescript
enum HealingStrategy {
  TEXT_MATCH = 'text_match',           // Find element by visible text
  ARIA_ROLE = 'aria_role',            // Find by ARIA role + label
  VISUAL_LOCATE = 'visual_locate',    // Vision-based element location
  XPATH_RELATIVE = 'xpath_relative',  // Relative XPath from stable ancestor
  CSS_SIMILAR = 'css_similar',        // Similar CSS selector
  NEIGHBOR_ANCHOR = 'neighbor_anchor', // Locate via nearby stable element
  SEMANTIC_MATCH = 'semantic_match',   // Match by purpose/semantics
  FULL_RESCAN = 'full_rescan',        // Complete page re-analysis
}

class TestHealer {
  async heal(brokenStep: TestStep, page: Page): Promise<HealingResult> {
    // 1. Try each strategy in order of cost (cheapest first)
    for (const strategy of this.strategies) {
      const result = await strategy.tryHeal(brokenStep, page);
      if (result.confidence > 0.8) {
        // 2. Verify the healed selector actually works
        const verified = await this.verify(result.healedStep, page);
        if (verified) {
          // 3. Learn from successful heal
          await this.learningStore.record(brokenStep, result);
          return { success: true, strategy, healedStep: result.healedStep };
        }
      }
    }
    // 4. All strategies failed — escalate to LLM
    return { success: false, escalated: true };
  }
}
```

### 4.2 Autonomous Test Generation

```typescript
// packages/core/src/generation/
interface GenerationSource {
  type: 'codebase' | 'sitemap' | 'user-flow' | 'figma' | 'swagger';
  path: string;
}

class TestGenerator {
  async analyzeSource(source: GenerationSource): Promise<PageMap>
  async generateTestSuite(pageMap: PageMap, options: GenerationOptions): Promise<TestSuite>
  async generateFromUserFlow(flow: UserFlow): Promise<TestSuite>
  async generateFromCodebase(repoPath: string): Promise<TestSuite>
  async generateEdgeCases(baseTest: TestCase): Promise<TestCase[]>
}

interface TestSuite {
  name: string;
  tests: TestCase[];
  coverage: {
    pages: number;
    forms: number;
    navigationPaths: number;
    edgeCases: number;
    estimatedCoverage: number;  // 0-100
  };
}
```

**Generation pipeline:**
1. **Crawl** — discover all pages, forms, navigation paths
2. **Analyze** — classify page types (login, dashboard, form, listing, etc.)
3. **Generate** — create test cases for each page type
4. **Edge cases** — generate boundary tests (empty forms, long strings, SQL injection, etc.)
5. **Optimize** — deduplicate, order by risk, group by dependency

### 4.3 CLI Commands

```bash
inspect heal                           # Run healing on last failed test
inspect heal --strategy visual         # Use specific strategy
inspect heal --learn                   # Show learned healing patterns

inspect generate --source sitemap https://example.com    # From sitemap
inspect generate --source codebase ./src                 # From code
inspect generate --source user-flow flows/checkout.json  # From user flow
inspect generate --edge-cases                            # Add edge cases
```

**Tests: 30+ tests covering:**
- Each healing strategy independently
- Healing chain (try strategies in order)
- Learning store persistence
- Test generation from sitemap
- Test generation from code analysis
- Edge case generation

---

## PHASE 5: Advanced Observability & Cost Intelligence (3 weeks)
**Why**: Enterprise buyers need cost predictability. "FinOps for agents" is a new category.

### 5.1 Cost Intelligence Engine

```
packages/observability/src/cost/
├── tracker.ts              # Real-time cost tracking
├── predictor.ts            # Cost prediction before run
├── optimizer.ts            # Cost optimization suggestions
├── budget.ts               # Budget management
├── attribution.ts          # Cost per agent/tenant/session
└── cost.test.ts
```

```typescript
class CostPredictor {
  async predict(config: TestConfig): Promise<CostEstimate> {
    const pageComplexity = await this.analyzePage(config.url);
    const estimatedSteps = this.estimateSteps(config.instruction, pageComplexity);
    const tokensPerStep = this.estimateTokens(config.provider, pageComplexity);
    const costPerToken = PRICING[config.provider][config.model];
    
    return {
      estimatedSteps,
      estimatedTokens: estimatedSteps * tokensPerStep,
      estimatedCost: (estimatedSteps * tokensPerStep * costPerToken) / 1000,
      confidence: 0.75,
      breakdown: {
        planning: 0.15,
        execution: 0.60,
        verification: 0.15,
        reporting: 0.10,
      },
    };
  }
}

class CostOptimizer {
  async suggestOptimizations(run: TestRun): Promise<Optimization[]> {
    return [
      { type: 'use_flash_mode', savings: '40%', impact: 'minimal' },
      { type: 'enable_caching', savings: '90%', impact: 'none', condition: 'repeat run' },
      { type: 'reduce_vision', savings: '25%', impact: 'low', condition: 'DOM sufficient' },
      { type: 'use_local_model', savings: '100%', impact: 'quality trade-off' },
    ];
  }
}
```

### 5.2 Real-Time Tracing

```typescript
// Distributed tracing for agent execution
interface Trace {
  traceId: string;
  spans: Span[];
  totalDuration: number;
  totalCost: number;
  totalTokens: number;
}

interface Span {
  spanId: string;
  parentSpanId?: string;
  name: string;              // 'llm_call', 'browser_action', 'cache_lookup'
  startTime: number;
  endTime: number;
  tags: Record<string, unknown>;
  events: SpanEvent[];
}

class Tracer {
  startTrace(name: string): Trace
  startSpan(trace: Trace, name: string, parent?: Span): Span
  endSpan(span: Span, tags?: Record<string, unknown>): void
  exportTrace(trace: Trace, format: 'jaeger' | 'zipkin' | 'otel'): string
}
```

### 5.3 CLI Commands

```bash
inspect cost                          # Show cost summary for last run
inspect cost --predict --url ...      # Predict cost before running
inspect cost --optimize               # Show optimization suggestions
inspect cost --history --days 30      # Cost history
inspect trace <session-id>            # Show distributed trace
inspect trace --export jaeger         # Export for Jaeger UI
```

**Tests: 20+ tests covering:**
- Cost prediction accuracy
- Budget enforcement
- Optimization suggestions
- Trace/span creation and export
- Attribution across agents

---

## PHASE 6: Cloud Browser & Remote Execution (3 weeks)
**Why**: Enterprise can't run browsers locally in CI. Cloud browser support is table stakes.

### 6.1 Cloud Browser Provider

```
packages/browser/src/cloud/
├── provider.ts             # Cloud browser provider interface
├── browserbase.ts          # Browserbase integration
├── steel.ts                # Steel Browser integration
├── lightpanda.ts           # Lightpanda integration (already exists partially)
├── cdp-connector.ts        # Generic CDP WebSocket connector
├── session-pool.ts         # Cloud session lifecycle
└── cloud.test.ts
```

```typescript
interface CloudBrowserConfig {
  provider: 'browserbase' | 'steel' | 'lightpanda' | 'custom';
  apiKey?: string;
  cdpUrl?: string;               // For custom CDP endpoints
  region?: string;               // Geo-targeting
  proxy?: {
    country: string;
    type: 'residential' | 'datacenter';
  };
  session: {
    maxDuration: number;         // ms
    keepAlive: boolean;
    retryOnDisconnect: boolean;
  };
}

class CloudBrowserProvider {
  async createSession(config: CloudBrowserConfig): Promise<CloudSession>
  async getSession(id: string): Promise<CloudSession>
  async destroySession(id: string): Promise<void>
  async listSessions(): Promise<CloudSession[]>
  async connectCDP(sessionId: string): Promise<CDPConnection>
}
```

### 6.2 Session Pool Manager

```typescript
class SessionPool {
  constructor(
    private maxSessions: number,
    private provider: CloudBrowserProvider
  ) {}
  
  async acquire(): Promise<CloudSession>
  async release(session: CloudSession): void
  async warmUp(count: number): Promise<void>    // Pre-create sessions
  async healthCheck(): Promise<PoolHealth>
}
```

### 6.3 CLI Commands

```bash
inspect cloud setup --provider browserbase    # Configure cloud browser
inspect cloud sessions                        # List active sessions
inspect cloud test -m "..." --cloud           # Run test on cloud browser
inspect cloud regions                         # Available regions
```

---

## PHASE 7: MCP Ecosystem Expansion (2 weeks)
**Why**: MCP is the emerging standard. Being the best MCP tool server = ecosystem lock-in.

### 7.1 Enhanced MCP Server

```
packages/mcp/
├── server.ts               # MCP tool server
├── tools/
│   ├── browser-tools.ts    # navigate, click, fill, screenshot, etc.
│   ├── test-tools.ts       # run_test, assert, validate
│   ├── quality-tools.ts    # a11y_audit, perf_audit, security_scan
│   ├── data-tools.ts       # extract, crawl, track
│   ├── visual-tools.ts     # visual_diff, screenshot_compare
│   └── proxy-tools.ts      # network_fault, proxy_start
├── resources/
│   ├── page-snapshot.ts    # Current page as MCP resource
│   ├── test-results.ts     # Test results as MCP resource
│   └── audit-trail.ts      # Audit trail as MCP resource
├── prompts/
│   ├── test-generator.ts   # MCP prompt for test generation
│   └── bug-reporter.ts     # MCP prompt for bug reporting
└── mcp.test.ts
```

### 7.2 MCP Resources (read-only data exposed to LLMs)

```typescript
// Expose page state as MCP resource
const pageSnapshotResource = {
  uri: 'inspect://page/current',
  name: 'Current Page Snapshot',
  description: 'ARIA tree, DOM summary, and screenshot of current page',
  mimeType: 'application/json',
  read: async () => ({
    url: page.url(),
    title: await page.title(),
    ariaTree: await buildAriaSnapshot(page),
    screenshot: await page.screenshot({ encoding: 'base64' }),
    consoleErrors: consoleErrors,
    networkRequests: recentRequests,
  }),
};
```

### 7.3 MCP Prompts (reusable prompt templates)

```typescript
const testGeneratorPrompt = {
  name: 'generate_test',
  description: 'Generate a test case for a given URL',
  arguments: [
    { name: 'url', description: 'URL to test', required: true },
    { name: 'focus', description: 'What to test (e.g., forms, navigation)', required: false },
  ],
  getMessages: async (args) => [
    { role: 'user', content: `Generate a comprehensive test for ${args.url} focusing on ${args.focus || 'all functionality'}` },
  ],
};
```

---

## Implementation Timeline

```
Week  1-2:  Phase 0 — Integration Wiring (CRITICAL)
Week  3-6:  Phase 1 — Agent Governance & Observability
Week  7-11: Phase 2 — True Multi-Agent Orchestration
Week 12-15: Phase 3 — Enterprise Local-First Deployment
Week 16-19: Phase 4 — Self-Healing & Autonomous Test Generation
Week 20-22: Phase 5 — Advanced Observability & Cost Intelligence
Week 23-25: Phase 6 — Cloud Browser & Remote Execution
Week 26-27: Phase 7 — MCP Ecosystem Expansion
Ongoing:    Phase 8 — Test Coverage Sprint (target 80%)
```

**Total: ~27 weeks (7 months)**

---

## Dependencies & Sequencing

```
Phase 1 (Governance) ──────────────────────────┐
                                                 ├── Phase 5 (Cost) depends on Phase 1
Phase 2 (Orchestration) ───────────────────────┤
                                                 ├── Phase 6 (Cloud) independent
Phase 3 (Enterprise) ──────────────────────────┤
                                                 ├── Phase 7 (MCP) can start anytime
Phase 4 (Self-Healing) ────────────────────────┘
```

Phases 1, 2, 3, 4 can be worked on in parallel by different developers.

---

## Test Targets

| Phase | New Tests | Cumulative |
|-------|-----------|------------|
| Current | — | 986 |
| Phase 0 | +15 | 1,001 |
| Phase 1 | +25 | 1,026 |
| Phase 2 | +30 | 1,056 |
| Phase 3 | +25 | 1,081 |
| Phase 4 | +30 | 1,111 |
| Phase 5 | +20 | 1,131 |
| Phase 6 | +15 | 1,146 |
| Phase 7 | +15 | 1,161 |
| Phase 8 | +500+ | 1,661+ |

**Target: 1,661+ passing tests (from ~6-7% to 80% coverage)**

---

## Competitive Positioning After Build Plan

| Feature | Inspect | Stagehand | Skyvern | browser-use |
|---------|---------|-----------|---------|-------------|
| Multi-agent orchestration | ✅ DAG graphs | ❌ Single | ✅ Swarm | ❌ Single |
| Agent governance | ✅ Audit + RBAC | ❌ | ❌ | ❌ |
| Local-first enterprise | ✅ Ollama + fleet | ❌ | ❌ | ❌ |
| Self-healing tests | ✅ 8 strategies | ❌ | ❌ | ❌ |
| Autonomous generation | ✅ From sitemap/code | ❌ | ❌ | ❌ |
| Cost intelligence | ✅ Predict + optimize | ❌ | ❌ | ❌ |
| Cloud browser | ✅ 3 providers | ✅ Browserbase | ❌ | ❌ |
| MCP ecosystem | ✅ Tools+resources+prompts | ❌ | ✅ Partial | ❌ |
| Compliance | ✅ EU AI Act ready | ❌ | ❌ | ❌ |
| Testing spectrum | ✅ 13 types | ❌ Browser only | ❌ Browser only | ❌ Browser only |

---

## Updated ROADMAP

Replace ROADMAP-100.md and ROADMAP-200.md with this BUILD-PLAN.md.

Items from ROADMAP-100/200 that are **already done** (keep for reference):
- Tasks 1-15: Act caching, loop detection ✅
- Tasks 16-20: Fallback LLM ✅
- Tasks 21-35: Vision + DOM fusion (partially — speculative planning done) ✅
- Tasks 36-46: Run caching, session resume ✅
- Tasks 47-55: Token budget, structured output ✅
- Tasks 56-70: Better prompts, watchdog integration ✅
- Tasks 71-85: Output improvements (partially) 
- Tasks 101-103: Sensitive data masking ✅
- Tasks 104-106: Judge LLM ✅
- Tasks 107-109: Flash mode (partially)
- Tasks 110-112: Message compaction ✅
- Tasks 113-116: Custom tool registration ✅
- Tasks 117-119: Replan on stall ✅
- Tasks 120-122: CAPTCHA solving ✅
- Tasks 123-125: OTP/2FA ✅
- Tasks 141-143: Cloud browser (in this plan)
- Tasks 147-149: Agent memory ✅

**Remaining from old roadmaps to fold into new plan:**
- Tasks 71-75: Clean output (Claude Code style) — add to Phase 5
- Tasks 76-80: Report improvements — add to Phase 5
- Tasks 81-85: Export improvements — add to Phase 5
- Tasks 86-95: CLI + Config — add to each phase
- Tasks 126-128: Proxy & geo-targeting — add to Phase 6
- Tasks 129-131: Domain restriction — already in permissions (Phase 1)
- Tasks 132-137: File upload/drag-drop — add to Phase 4
- Tasks 138-140: Prompt caching — add to Phase 5
- Tasks 153-155: Network interception — add to Phase 6
- Tasks 156-158: ARIA-first execution — add to Phase 4
