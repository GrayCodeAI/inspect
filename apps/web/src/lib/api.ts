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
