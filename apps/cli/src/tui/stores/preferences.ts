import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { create } from "zustand";

interface Preferences {
  agentBackend: string;
  browserHeaded: boolean;
  defaultDevice: string;
  defaultMode: string;
  instructionHistory: string[];
  notifications: boolean;
}

interface PreferencesState extends Preferences {
  setAgent: (agent: string) => void;
  setHeaded: (headed: boolean) => void;
  setDevice: (device: string) => void;
  setMode: (mode: string) => void;
  addToHistory: (instruction: string) => void;
  setNotifications: (enabled: boolean) => void;
  loadFromDisk: () => void;
  saveToDisk: () => void;
}

function loadPersistedPreferences(): Partial<Preferences> {
  try {
    const prefPath = join(process.cwd(), ".inspect", "preferences.json");
    if (existsSync(prefPath)) {
      return JSON.parse(readFileSync(prefPath, "utf-8")) as Partial<Preferences>;
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

function persistPreferences(prefs: Partial<Preferences>): void {
  try {
    const dir = join(process.cwd(), ".inspect");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "preferences.json"), JSON.stringify(prefs, null, 2));
  } catch {
    // Ignore write errors
  }
}

const persisted = loadPersistedPreferences();

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  agentBackend: persisted.agentBackend ?? "claude",
  browserHeaded: persisted.browserHeaded ?? false,
  defaultDevice: persisted.defaultDevice ?? "desktop-chrome",
  defaultMode: persisted.defaultMode ?? "hybrid",
  instructionHistory: persisted.instructionHistory ?? [],
  notifications: persisted.notifications ?? true,

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

  loadFromDisk: () => {
    const loaded = loadPersistedPreferences();
    set({
      agentBackend: loaded.agentBackend ?? "claude",
      browserHeaded: loaded.browserHeaded ?? false,
      defaultDevice: loaded.defaultDevice ?? "desktop-chrome",
      defaultMode: loaded.defaultMode ?? "hybrid",
      instructionHistory: loaded.instructionHistory ?? [],
      notifications: loaded.notifications ?? true,
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
    });
  },
}));
