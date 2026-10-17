import { create } from "zustand";
import { errorMessage } from "../lib/errors";
import {
  getChampionRows,
  getSummary,
  onStatsUpdated,
  syncStats,
  type ChampRow,
  type StatsSummary,
} from "../lib/stats";

interface StatsState {
  summary: StatsSummary;
  champRows: ChampRow[];
  error: string | null;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  init: () => () => void;
}

const EMPTY_SUMMARY: StatsSummary = {
  soloqGames: 0,
  proGames: 0,
  patches: [],
  generatedAt: null,
  syncing: false,
  lastError: null,
};

export const useStatsStore = create<StatsState>((set, get) => ({
  summary: EMPTY_SUMMARY,
  champRows: [],
  error: null,

  refresh: async () => {
    try {
      const summary = await getSummary();
      const changed = summary.generatedAt !== get().summary.generatedAt;
      const champRows = changed ? await getChampionRows() : get().champRows;
      set({ summary, champRows, error: null });
    } catch (error: unknown) {
      set({ error: errorMessage(error) });
    }
  },

  sync: async () => {
    await syncStats().catch((error: unknown) => set({ error: errorMessage(error) }));
  },

  init: () => {
    void get().refresh();
    const unlisten = onStatsUpdated(() => void get().refresh());
    return () => void unlisten.then((stop) => stop());
  },
}));
