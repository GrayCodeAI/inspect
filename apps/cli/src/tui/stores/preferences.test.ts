import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePreferencesStore } from "./preferences.js";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeProjectContext } from "../../utils/project-context.js";

describe("usePreferencesStore", () => {
  const testDir = join(tmpdir(), "inspect-prefs-test-" + Date.now());

  beforeEach(() => {
    // Create test directory and initialize project context FIRST
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, ".inspect"), { recursive: true });
    initializeProjectContext(testDir);

    // Reset store state by loading from disk (which will use defaults since file doesn't exist)
    usePreferencesStore.getState().loadFromDisk();
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("initial state", () => {
    it("has correct default values", () => {
      const state = usePreferencesStore.getState();

      expect(state.instructionHistory).toEqual([]);
      expect(state.agentBackend).toBe("claude");
      expect(state.defaultDevice).toBe("desktop-chrome");
      expect(state.defaultMode).toBe("hybrid");
      expect(state.browserHeaded).toBe(false);
      expect(state.notifications).toBe(true);
    });
  });

  describe("addToHistory", () => {
    it("adds instruction to history", () => {
      const { addToHistory } = usePreferencesStore.getState();

      addToHistory("test the login page");

      const state = usePreferencesStore.getState();
      expect(state.instructionHistory).toContain("test the login page");
    });

    it("removes duplicates and moves to front", () => {
      const { addToHistory } = usePreferencesStore.getState();

      addToHistory("first instruction");
      addToHistory("second instruction");
      addToHistory("first instruction");

      const state = usePreferencesStore.getState();
      expect(state.instructionHistory[0]).toBe("first instruction");
      expect(state.instructionHistory).toHaveLength(2);
    });

    it("limits history to 20 items", () => {
      const { addToHistory } = usePreferencesStore.getState();

      // Add 22 items
      for (let i = 0; i < 22; i++) {
        addToHistory(`instruction ${i}`);
      }

      const state = usePreferencesStore.getState();
      expect(state.instructionHistory).toHaveLength(20);
    });

    it("ignores empty instructions", () => {
      const { addToHistory } = usePreferencesStore.getState();

      addToHistory("");
      addToHistory("   ");

      const state = usePreferencesStore.getState();
      expect(state.instructionHistory).toHaveLength(0);
    });
  });

  describe("setDevice", () => {
    it("updates default device", () => {
      const { setDevice } = usePreferencesStore.getState();

      setDevice("mobile-ios");

      const state = usePreferencesStore.getState();
      expect(state.defaultDevice).toBe("mobile-ios");
    });
  });

  describe("setMode", () => {
    it("updates default mode", () => {
      const { setMode } = usePreferencesStore.getState();

      setMode("cua");

      const state = usePreferencesStore.getState();
      expect(state.defaultMode).toBe("cua");
    });
  });

  describe("setAgent", () => {
    it("updates agent backend", () => {
      const { setAgent } = usePreferencesStore.getState();

      setAgent("gpt");

      const state = usePreferencesStore.getState();
      expect(state.agentBackend).toBe("gpt");
    });
  });

  describe("setHeaded", () => {
    it("updates headed preference", () => {
      const { setHeaded } = usePreferencesStore.getState();

      setHeaded(true);

      const state = usePreferencesStore.getState();
      expect(state.browserHeaded).toBe(true);
    });
  });

  describe("setNotifications", () => {
    it("updates notifications preference", () => {
      const { setNotifications } = usePreferencesStore.getState();

      setNotifications(false);

      const state = usePreferencesStore.getState();
      expect(state.notifications).toBe(false);
    });
  });

  describe("persistence", () => {
    it("saves preferences to disk", () => {
      const { setDevice, setAgent } = usePreferencesStore.getState();

      setDevice("tablet-ipad");
      setAgent("gemini");

      // Verify file was created
      const prefsPath = join(testDir, ".inspect", "preferences.json");
      expect(existsSync(prefsPath)).toBe(true);

      // Read and verify content
      const content = JSON.parse(usePreferencesStore.getState().saveToDisk() || "{}");
      // Note: saveToDisk doesn't return content, we just verify no error is thrown
    });

    it("loads preferences from disk", () => {
      // Create preferences file manually
      const prefs = {
        agentBackend: "deepseek",
        browserHeaded: true,
        defaultDevice: "mobile-android",
        defaultMode: "dom",
        instructionHistory: ["previous test"],
        notifications: false,
        modelPreferences: {},
      };

      writeFileSync(join(testDir, ".inspect", "preferences.json"), JSON.stringify(prefs, null, 2));

      // Load from disk
      usePreferencesStore.getState().loadFromDisk();

      const state = usePreferencesStore.getState();
      expect(state.defaultDevice).toBe("mobile-android");
      expect(state.agentBackend).toBe("deepseek");
      expect(state.browserHeaded).toBe(true);
      expect(state.notifications).toBe(false);
    });
  });

  describe("saveToDisk and loadFromDisk", () => {
    it("persists all preferences correctly", () => {
      const store = usePreferencesStore.getState();

      // Set various preferences
      store.setDevice("mobile-ios");
      store.setMode("cua");
      store.setAgent("openai");
      store.setHeaded(true);
      store.setNotifications(false);
      store.addToHistory("test instruction");

      // Save to disk
      store.saveToDisk();

      // Reset store to defaults
      store.loadFromDisk();

      // Verify loaded values
      const loaded = usePreferencesStore.getState();
      expect(loaded.defaultDevice).toBe("mobile-ios");
      expect(loaded.defaultMode).toBe("cua");
      expect(loaded.agentBackend).toBe("openai");
      expect(loaded.browserHeaded).toBe(true);
      expect(loaded.notifications).toBe(false);
      expect(loaded.instructionHistory).toContain("test instruction");
    });
  });
});
