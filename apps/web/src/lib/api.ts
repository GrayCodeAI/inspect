// ============================================================================
// API Client — Communicates with the Inspect API server
// ============================================================================

const BASE_URL = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// System
export const getHealth = () =>
  request<{ status: string; uptime: number; version: string; checks: Record<string, { status: string; message?: string }> }>("/health");

export const getVersion = () =>
  request<{ version: string; name: string; node: string; platform: string }>("/version");

export const getModels = (provider?: string) =>
  request<{ models: Array<{ key: string; id: string; name: string; provider: string; supportsVision: boolean; supportsThinking: boolean; costPer1kInput: number; costPer1kOutput: number }>; total: number }>(
    `/models${provider ? `?provider=${provider}` : ""}`,
  );

// Tasks
export const createTask = (data: { prompt: string; url: string; maxSteps?: number }) =>
  request<{ id: string; status: string; createdAt: number }>("/tasks", { method: "POST", body: JSON.stringify(data) });

export const getTask = (id: string) =>
  request<{ id: string; status: string; definition: Record<string, unknown>; steps?: unknown[]; error?: string }>(`/tasks/${id}`);

// Workflows
export const listWorkflows = () =>
  request<{ workflows: Array<{ id: string; name: string; status: string; blocks: unknown[]; createdAt: number }>; total: number }>("/workflows");

export const createWorkflow = (data: { name: string; description?: string }) =>
  request<{ id: string; name: string; status: string }>("/workflows", { method: "POST", body: JSON.stringify(data) });

// Credentials
export const listCredentials = () =>
  request<Array<{ id: string; label: string; type: string; provider: string; domain?: string }>>("/credentials");

// Sessions
export const listSessions = () =>
  request<{ sessions: Array<{ id: string; status: string; browserType: string; createdAt: number }>; total: number }>("/sessions");

// Devices
export const getDevices = () =>
  request<{ devices: Array<{ key: string; name: string; width: number; height: number; dpr: number; mobile: boolean }>; total: number }>("/devices");

// Agents
export const getAgents = () =>
  request<{ agents: Array<{ key: string; name: string; provider: string; supportsVision: boolean; supportsThinking: boolean }>; total: number }>("/agents");

// Runs (task history)
export const listRuns = (limit = 20) =>
  request<{ runs: Array<{ id: string; instruction: string; status: string; agent: string; device: string; duration: number; timestamp: string; tokenCount?: number }>; total: number }>(`/tasks?limit=${limit}`).catch(() => ({ runs: [], total: 0 }));

// Task details with steps
export const getTaskDetails = (id: string) =>
  request<{
    id: string;
    status: string;
    definition: { prompt: string; url: string; maxSteps: number };
    result?: { passed: boolean; duration: number; summary: string; stepsCompleted: number };
    steps?: Array<{ index: number; description: string; status: string; duration: number; toolCalls?: unknown[]; error?: string }>;
    extractedData?: unknown;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }>(`/tasks/${id}`);

// Quality audit results
export const getA11yResults = () =>
  request<{
    score: number;
    violations: Array<{ id: string; impact: string; description: string; nodes: number }>;
    passes: number;
    total: number;
    standard: string;
    url: string;
    timestamp: number;
  }>("/audits/a11y").catch(() => null);

export const getPerfResults = () =>
  request<{
    scores: { performance: number; accessibility: number; bestPractices: number; seo: number };
    metrics: Record<string, { value: number; rating: string; displayValue?: string }>;
    url: string;
    timestamp: number;
  }>("/audits/performance").catch(() => null);
