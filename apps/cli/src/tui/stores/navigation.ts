import { create } from "zustand";

type Screen =
  | { type: "main" }
  | { type: "testing"; config: Record<string, unknown> }
  | { type: "results"; results: Record<string, unknown> }
  | { type: "flowPicker" }
  | { type: "devicePicker" }
  | { type: "agentPicker" };

interface NavigationState {
  current: Screen;
  previous: Screen | null;
  setScreen: (screen: Screen) => void;
  navigateTo: (screen: Screen) => void;
  goBack: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  current: { type: "main" },
  previous: null,

  setScreen: (screen) => set({ current: screen, previous: null }),

  navigateTo: (screen) => set({ current: screen, previous: get().current }),

  goBack: () => {
    const { previous } = get();
    if (previous) {
      set({ current: previous, previous: null });
    }
  },
}));
