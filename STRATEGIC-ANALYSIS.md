# Inspect Project — Strategic Analysis & Future Direction

## March 2026

---

## 1. Top 20 Competitors & Market Landscape

| #   | Project                        | Stars   | Approach                  | Domain                     |
| --- | ------------------------------ | ------- | ------------------------- | -------------------------- |
| 1   | **Browser Use**                | 81,200+ | DOM+LLM, Python           | Autonomous web agent       |
| 2   | **Firecrawl**                  | 82,000+ | DOM scraping              | Data extraction API        |
| 3   | **Playwright MCP** (Microsoft) | 29,200+ | Accessibility tree        | MCP server for AI          |
| 4   | **Stagehand** (Browserbase)    | 21,600+ | Playwright+LLM, TS        | AI browser automation      |
| 5   | **Skyvern**                    | 20,900+ | Vision+LLM                | No-code browser automation |
| 6   | **Operator** (OpenAI)          | —       | Vision                    | GPT-4o browser agent       |
| 7   | **Computer Use** (Anthropic)   | —       | Vision+DOM                | Claude browser control     |
| 8   | **Midscene**                   | —       | Vision+AI                 | AI-act/assert/query        |
| 9   | **ZeroStep**                   | —       | Playwright+AI             | Simple AI plugin           |
| 10  | **Momentic**                   | —       | AI test automation        | No-code testing            |
| 11  | **Octomind**                   | —       | AI E2E testing            | Auto-healing tests         |
| 12  | **Bug0**                       | —       | AI QA engineer            | Managed QA                 |
| 13  | **TestMu (LambdaTest)**        | —       | KaneAI agent              | Testing cloud              |
| 14  | **Katalon Studio**             | —       | AI test automation        | Enterprise testing         |
| 15  | **Testsigma**                  | —       | 5 AI agents               | Codeless testing           |
| 16  | **Currents.dev**               | —       | Playwright analytics      | Test management            |
| 17  | **Browserbase**                | —       | Cloud infra (raised $40M) | Browser-as-a-service       |
| 18  | **Steel Browser**              | 6,400+  | Cloud infra OSS           | Self-hosted browser API    |
| 19  | **LaVague**                    | —       | Python LAM framework      | Web agent framework        |
| 20  | **Selenium + AI**              | —       | WebDriver+LLM             | Legacy + AI layer          |

---

## 2. What Others Are Doing (Key Patterns)

### Architecture Approaches

- **DOM + ARIA Tree**: Playwright MCP, Stagehand — fast, cheap, text-based
- **Vision-based**: Skyvern, Operator, Computer Use — slow, expensive, works anywhere
- **Hybrid**: Browser Use 2.0 — DOM for most, vision for edge cases

### Key Features Being Shipped

- **Action Caching** (Stagehand v3): Reuse successful actions without LLM — 90% cost savings
- **Self-Healing** (Playwright agents): Auto-fix broken selectors with 75%+ success rate
- **Plan → Generate → Heal loop**: Playwright's 3 built-in agents work in a pipeline
- **Markdown-first test intent**: Tests written as Markdown specs, generated as code
- **MCP everywhere**: Every major tool now exposes MCP — the new universal protocol
- **Token budget**: Playwright MCP uses ~114K tokens/test; CLI uses ~27K — 4x cost difference
- **Benchmark competitions**: Browser Use scoring 89.1% on WebVoyager

### Business Models

| Model                | Examples                         | Pricing                    |
| -------------------- | -------------------------------- | -------------------------- |
| Open-source + Cloud  | Browser Use, Stagehand, Steel    | Free SDK + $20-99/mo cloud |
| MCP server (free)    | Playwright MCP, mcp-playwright   | Completely free            |
| SaaS platform        | TestMu, LambdaTest, BrowserStack | $29-149/mo                 |
| Managed QA service   | Bug0, Octomind                   | $250-2,500/mo              |
| Cloud infrastructure | Browserbase, Steel               | $20-99/mo per browser      |

---

## 3. Where Inspect Stands Today

### Strengths (Better than most competitors)

| Feature                  | Inspect                                             | Competitors                      |
| ------------------------ | --------------------------------------------------- | -------------------------------- |
| **20 MCP tools**         | ✅ (14 browser + 6 quality)                         | Playwright MCP: 20, Stagehand: 3 |
| **6 healing strategies** | ✅ (exact/semantic/fuzzy/vision/CSS/neighbor)       | Stagehand: 2, Playwright: 1      |
| **Workflow engine**      | ✅ (15 block types)                                 | Skyvern: partial, others: none   |
| **Multi-LLM support**    | ✅ (5 providers: Claude/GPT/Gemini/DeepSeek/Ollama) | Browser Use: yes, Stagehand: yes |
| **SSO + Multi-tenancy**  | ✅ (SAML/OIDC/Azure/Okta, 3 plans)                  | Most: none                       |
| **Governance**           | ✅ (Audit trail, autonomy levels, permissions)      | Most: none                       |
| **Cost intelligence**    | ✅ (Predictor, attribution, budget alerts)          | Most: basic                      |
| **Specialist prompts**   | ✅ (UX, security, a11y, performance experts)        | Most: generic agent              |

### Gaps (Where competitors lead)

| Gap                        | Who Leads                                      | Impact             |
| -------------------------- | ---------------------------------------------- | ------------------ |
| **GitHub stars/community** | Browser Use (81K), Firecrawl (82K)             | Discoverability    |
| **Benchmark score**        | Browser Use (89.1% WebVoyager)                 | Credibility        |
| **Cloud offering**         | Browserbase ($40M raised), Steel               | Revenue model      |
| **IDE integration**        | Playwright MCP (Copilot, Cursor, VS Code)      | Developer adoption |
| **Simple API**             | Stagehand (3 functions), ZeroStep (1 function) | Ease of use        |
| **Mobile testing**         | TestMu, Testsigma                              | Market coverage    |
| **Managed service**        | Bug0 ($2,500/mo)                               | Enterprise revenue |

---

## 4. Future Direction — Strategic Recommendations

### Priority 1: Community & Adoption (Q2 2026)

**Problem**: Inspect has 22+ systems but zero community. Browser Use has 81K stars because it's simple to try.

**Actions**:

1. **Publish to npm** — `npx inspect test "login flow" https://example.com`
2. **Create a standalone MCP package** — `@inspect/mcp-server` installable via any MCP client
3. **Write a benchmark** — Run Inspect against WebVoyager, publish results
4. **Write comparison docs** — "Inspect vs Stagehand", "Inspect vs Playwright MCP"
5. **GitHub Actions integration** — One-line CI setup

### Priority 2: Simplify the API (Q2 2026)

**Problem**: Inspect has 15 packages, 122 types, 25 utils — too complex for first-time users.

**Actions**:

1. **3-function API** (like Stagehand):

   ```ts
   import { act, extract, observe } from "inspect";

   await act("Click the login button", { page });
   const data = await extract("Get the order total", { page, schema });
   const elements = await observe("What buttons are visible?", { page });
   ```

2. **Auto-configure**: Default to sensible settings, no config required
3. **One-line test**: `inspect test "verify login works" https://app.com`

### Priority 3: Cloud Infrastructure (Q3 2026)

**Problem**: Browserbase raised $40M. Steel is OSS. Inspect has no managed cloud.

**Actions**:

1. **Partner or integrate** with Browserbase/Steel for browser infra
2. **Inspect Cloud** — managed test execution with:
   - Parallel browser sessions
   - Automatic screenshots + traces
   - Cost dashboard per team
   - Slack/Discord notifications
3. **Pricing**: Free tier (5 tests/day) → Pro ($29/mo) → Enterprise (custom)

### Priority 4: IDE Integration (Q3 2026)

**Problem**: Playwright MCP is in VS Code Copilot. Inspect is CLI-only.

**Actions**:

1. **VS Code extension** — run tests inline, view results in sidebar
2. **Cursor integration** — MCP server + skill definitions
3. **JetBrains plugin** — for WebStorm/IntelliJ users

### Priority 5: Benchmark Leadership (Q2 2026)

**Problem**: Browser Use claims 89.1% on WebVoyager. No Inspect benchmark exists.

**Actions**:

1. **Create Inspect Benchmark Suite**:
   - WebVoyager compatibility
   - Custom test scenarios
   - Token efficiency measurement
   - Self-healing success rate
2. **Publish results** — aim to beat Browser Use
3. **Leaderboard** — ongoing public comparison

### Priority 6: Advanced Features (Q3-Q4 2026)

| Feature                       | Description                                           | Status                    |
| ----------------------------- | ----------------------------------------------------- | ------------------------- |
| **Auto-loop**                 | Plan→Generate→Run→Heal without human intervention     | Partial (executor exists) |
| **Test explosion governance** | Auto-deduplicate, prioritize, and prune test suites   | New                       |
| **Cross-browser matrix**      | Run same test on Chrome/Firefox/Safari simultaneously | Partial                   |
| **Video recording**           | Full session replay with trace viewer                 | Partial                   |
| **Mobile web testing**        | Device emulation + responsive testing                 | Partial (25 presets)      |
| **API testing**               | REST/GraphQL testing alongside browser tests          | Partial                   |
| **Visual regression**         | Pixel diff with AI-powered analysis                   | Exists (VisualDiff)       |
| **Cost prediction per test**  | Show estimated cost before running                    | Exists (CostPredictor)    |

---

## 5. The 3 Horizons

### Horizon 1 (Now — Q2 2026): Adoption

- npm publish + one-line install
- Standalone MCP package
- Benchmark results
- 3-function simplified API

### Horizon 2 (Q3 2026): Platform

- Cloud execution service
- IDE extensions (VS Code, Cursor)
- Test governance (dedup, prune, prioritize)
- Enterprise SSO integration

### Horizon 3 (Q4 2026 — 2027): Leadership

- Benchmark #1 on WebVoyager
- 10K+ GitHub stars
- Managed QA service option
- Multi-platform (mobile native + API + browser)

---

## 6. Key Insight

> **The market is splitting into two layers:**
>
> 1. **Intelligence layer** — who decides what to click and why (Browser Use, Stagehand, Inspect)
> 2. **Infrastructure layer** — who runs the browsers (Browserbase, Steel, Playwright)
>
> **Inspect should be the best intelligence layer and partner for infrastructure.**

Inspect's unique differentiator is **the combination of testing + automation + governance + cost intelligence in one framework**. No competitor has all four. Browser Use has automation. Stagehand has testing. Browserbase has infrastructure. Inspect has all of them integrated.

The path forward is:

1. **Simplify** — make the 3-function API the default experience
2. **Prove** — publish benchmarks showing Inspect's capabilities
3. **Ship** — npm package, MCP server, cloud service
4. **Grow** — community, docs, integrations

---

_Analysis date: March 29, 2026_
_Sources: GitHub, web searches, industry articles, competitor analysis_
