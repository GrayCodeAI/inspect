import { create } from "zustand";
import { loadHistory, type HistoryEntry } from "../services/history-service.js";

interface HistoryState {
  entries: HistoryEntry[];
  selectedIndex: number;
  showDetail: boolean;
  selectEntry: (index: number) => void;
  toggleDetail: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: loadHistory(),
  selectedIndex: 0,
  showDetail: false,
  selectEntry: (index) => set({ selectedIndex: index }),
  toggleDetail: () => set((state) => ({ showDetail: !state.showDetail })),
}));
