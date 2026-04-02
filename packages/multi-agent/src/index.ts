// Multi-Agent Test Scenarios
export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly role: "navigator" | "tester" | "validator" | "reporter";
}

export interface AgentMessage {
  readonly from: string;
  readonly to: string;
  readonly content: string;
  readonly timestamp: number;
}

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();
  private messages: AgentMessage[] = [];

  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  sendMessage(from: string, to: string, content: string): void {
    this.messages.push({ from, to, content, timestamp: Date.now() });
  }

  getAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getMessages(agentId?: string): AgentMessage[] {
    if (agentId) {
      return this.messages.filter((m) => m.from === agentId || m.to === agentId);
    }
    return this.messages;
  }
}

export const agentOrchestrator = new AgentOrchestrator();
