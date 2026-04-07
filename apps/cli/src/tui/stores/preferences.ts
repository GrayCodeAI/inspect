import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { create } from "zustand";
import { AgentProvider } from "@inspect/shared";
import { ProjectPaths, getInspectDir } from "../../utils/project-context.js";

interface ModelPreference {
  model: string;
  temperature?: number;
  maxTokens?: number;
}

type AgentBackend = typeof AgentProvider.Type;

interface Preferences {
  agentBackend: AgentBackend;
  browserHeaded: boolean;
  defaultDevice: string;
  defaultMode: string;
  instructionHistory: string[];
  notifications: boolean;
  modelPreferences: Record<AgentBackend, ModelPreference | undefined>;
}

interface PreferencesState extends Preferences {
  setAgent: (agent: AgentBackend) => void;
  setHeaded: (headed: boolean) => void;
  setDevice: (device: string) => void;
  setMode: (mode: string) => void;
  addToHistory: (instruction: string) => void;
  setNotifications: (enabled: boolean) => void;
  setModelPreference: (agent: AgentBackend, configId: string, modelValue: string) => void;
  loadFromDisk: () => void;
  saveToDisk: () => void;
}

function loadPersistedPreferences(): Partial<Preferences> {
  try {
    const prefPath = ProjectPaths.preferences();
    if (existsSync(prefPath)) {
      return JSON.parse(readFileSync(prefPath, "utf-8")) as Partial<Preferences>;
    }
  } catch (error) {
    console.warn("Failed to load preferences, using defaults:", error);
  }
  return {};
}

function persistPreferences(prefs: Partial<Preferences>): void {
  try {
    const dir = getInspectDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(ProjectPaths.preferences(), JSON.stringify(prefs, null, 2));
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
}

const persisted = loadPersistedPreferences();

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  agentBackend: (persisted.agentBackend as AgentBackend) ?? "claude",
  browserHeaded: persisted.browserHeaded ?? false,
  defaultDevice: persisted.defaultDevice ?? "desktop-chrome",
  defaultMode: persisted.defaultMode ?? "hybrid",
  instructionHistory: persisted.instructionHistory ?? [],
  notifications: persisted.notifications ?? true,
  modelPreferences: {
    claude: undefined,
    codex: undefined,
    copilot: undefined,
    gemini: undefined,
    cursor: undefined,
    opencode: undefined,
    droid: undefined,
  },

  setAgent: (agent) => {
    set({ agentBackend: agent });
    get().saveToDisk();
  },

  setHeaded: (headed) => {
    set({ browserHeaded: headed });
    get().saveToDisk();
  },

  setDevice: (device) => {
    set({ defaultDevice: device });
    get().saveToDisk();
  },

  setMode: (mode) => {
    set({ defaultMode: mode });
    get().saveToDisk();
  },

  addToHistory: (instruction) => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    const current = get().instructionHistory;
    const deduped = current.filter((h) => h !== trimmed);
    deduped.unshift(trimmed);
    const updated = deduped.slice(0, 20);
    set({ instructionHistory: updated });
    get().saveToDisk();
  },

  setNotifications: (enabled) => {
    set({ notifications: enabled });
    get().saveToDisk();
  },

  setModelPreference: (agent, configId, modelValue) => {
    set((state) => ({
      modelPreferences: { ...state.modelPreferences, [agent]: { configId, value: modelValue } },
    }));
    get().saveToDisk();
  },

  loadFromDisk: () => {
    const loaded = loadPersistedPreferences();
    set({
      agentBackend: (loaded.agentBackend as AgentBackend) ?? "claude",
      browserHeaded: loaded.browserHeaded ?? false,
      defaultDevice: loaded.defaultDevice ?? "desktop-chrome",
      defaultMode: loaded.defaultMode ?? "hybrid",
      instructionHistory: loaded.instructionHistory ?? [],
      notifications: loaded.notifications ?? true,
      modelPreferences: loaded.modelPreferences ?? {
        claude: undefined,
        codex: undefined,
        copilot: undefined,
        gemini: undefined,
        cursor: undefined,
        opencode: undefined,
        droid: undefined,
      },
    });
  },

  saveToDisk: () => {
    const state = get();
    persistPreferences({
      agentBackend: state.agentBackend,
      browserHeaded: state.browserHeaded,
      defaultDevice: state.defaultDevice,
      defaultMode: state.defaultMode,
      instructionHistory: state.instructionHistory,
      notifications: state.notifications,
      modelPreferences: state.modelPreferences,
    });
  },
}));
