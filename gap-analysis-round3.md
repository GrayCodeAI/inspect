# OSS-REF vs Inspect — Gap Analysis (Round 3)

> Date: 2026-04-03
>
> 28 repos analyzed. 26 repos fully covered by previous adoption rounds or existing Inspect packages.
> Only **3 genuinely missing features** identified across all repos.

## Already Covered (25 of 28 repos)

| OSS-REF Repo              | Key Feature                                  | Inspect Equivalent                                                      | Status     |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| anthropic-quickstarts     | Computer use, browser tools                  | packages/browser/, MCP adopted                                          | ✅ Covered |
| anthropic-quickstarts-new | Same as above                                | Same                                                                    | ✅ Covered |
| autogen                   | Multi-agent, MCP integration                 | packages/multi-agent/, packages/mcp/                                    | ✅ Covered |
| AutoGPT                   | Agent builder, workflow management           | packages/workflow/, packages/multi-agent/                               | ✅ Covered |
| axe-core                  | Accessibility auditing (WCAG)                | packages/a11y/                                                          | ✅ Covered |
| browser-agent (Magnitude) | Vision-first browser automation, test runner | VisionGrounding adopted, packages/browser/                              | ✅ Covered |
| browser-use               | LLM browser agent, stealth                   | Stealth mode adopted, environments                                      | ✅ Covered |
| courses                   | Anthropic tutorials (educational)            | Not software features                                                   | ✅ N/A     |
| e2b                       | Cloud sandboxed code execution               | packages/sandbox/                                                       | ✅ Covered |
| e2b-cookbook              | Example code                                 | Not features                                                            | ✅ N/A     |
| expect                    | AI browser testing (core concept)            | This IS what Inspect is                                                 | ✅ Covered |
| gpt-crawler               | Web crawler for knowledge files              | packages/crawler/ (SiteCrawler)                                         | ✅ Covered |
| gpt-engineer              | NL code generation                           | packages/codegen/                                                       | ✅ Covered |
| langchain                 | LLM framework, tool integration              | packages/llm/, packages/agent-tools/                                    | ✅ Covered |
| langflow                  | Visual workflow builder                      | visual-builder, workflow builder adopted                                | ✅ Covered |
| LibreChat                 | Chat UI platform, MCP, multi-model           | MCP adopted, multi-LLM supported                                        | ✅ Covered |
| lighthouse                | Performance auditing, budgets                | packages/lighthouse-quality/ + budgets.ts                               | ✅ Covered |
| openai-agents-python      | Multi-agent, guardrails, sessions            | multi-agent, governance, session packages                               | ✅ Covered |
| playwright                | Browser automation framework                 | packages/browser/ wraps Playwright                                      | ✅ Covered |
| playwright-mcp            | MCP server for Playwright                    | packages/mcp/                                                           | ✅ Covered |
| qawolf                    | Full-service QA with human review            | Testing framework exists; human review is a service model, not software | ✅ Covered |
| rrweb                     | Session recording/replay                     | packages/session-recording/                                             | ✅ Covered |
| skyvern                   | Workflow builder, CAPTCHA detection, stealth | workflow builder, captcha watchdog, stealth adopted                     | ✅ Covered |
| stagehand                 | NL browser automation, caching               | NL page actions, agent-memory cache                                     | ✅ Covered |
| uffizzi                   | Ephemeral environments                       | packages/environments/                                                  | ✅ Covered |

## Gaps Found — ONLY 3

| #   | Feature                                                                                | Source Repo               | Description                                                                                                                                                                                                                                                                                 | Where in Inspect                                               | Priority | Implementation Sketch                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Multi-agent web navigation with planner/grounder/reflector/summarizer architecture** | OpAgent (opagent/)        | OpAgent uses a 4-agent architecture: Planner (task decomposition), Grounder (DOM element identification), Reflector (error recovery/self-correction), Summarizer (result synthesis). Inspect's multi-agent has orchestrator + specialists but not this specialized web navigation pipeline. | packages/multi-agent/                                          | Medium   | Add PlannerAgent, GrounderAgent, ReflectorAgent, SummarizerAgent classes with specialized prompts to navigation-agents.ts. ReflectorAgent monitors execution failures and triggers recovery via Orchestrator.recover(). |
| 2   | **Vision-first pixel coordinate action execution**                                     | browser-agent (Magnitude) | Magnitude uses vision-grounded LLM that outputs pixel coordinates (x,y) for mouse actions instead of DOM selectors. Inspect uses DOM-based ARIA tree + vision grounding as an augmentation, but primary action execution is selector-based.                                                 | packages/browser/ (vision module)                              | Low      | Add visionAction() tool that takes screenshot → VLM → {x,y,action} → Playwright mouse.click(x,y). Fallback to selector-based when confidence is low. Requires vision model integration.                                 |
| 3   | **Generative UI / Code Artifacts in chat**                                             | LibreChat                 | LibreChat renders React/HTML/Mermaid diagrams inline in chat, allowing agents to produce interactive UI previews. Inspect is terminal-based (Ink TUI) and has no generative UI rendering capability.                                                                                        | New package: packages/artifacts/ or part of packages/reporter/ | Low      | A React component that takes LLM-generated code (React/HTML/Mermaid) and renders it in a sandboxed iframe. Would be most useful in the serve/web UI context. Low priority for a CLI-based testing tool.                 |

## Notes on Items Considered but Rejected as Gaps

- **Computer Use (desktop control)** — Out of scope for Inspect, which is a web testing tool. Desktop automation already partially exists via desktop-automate.ts command.
- **Web search for context enrichment** — Not a testing tool requirement; Inspect already augments context via DOM/ARIA snapshots and git diff analysis.
- **Human QA review service** — This is a business model (QA Wolf's service), not a software feature. Inspect provides automated testing; human review is orthogonal.
- **Kubernetes multi-tenancy** — packages/environments/ already handles Docker Compose-based ephemeral environments. K8s support would be a significant addition but is not present in any OSS-REF repo as a direct feature gap for Inspect's use case.
- **Self-healing with action caching** — packages/self-healing/ already implements selector similarity matching + DOM diff-based recovery. Stagehand's caching + selective LLM involvement is already handled by packages/agent-memory/ (action cache) and the codegen package's recording + regeneration.
