import { create } from "zustand";
import { loadChampionData, type Champion } from "../lib/ddragon";
import { errorMessage } from "../lib/errors";

interface ChampionState {
  version: string | null;
  champions: ReadonlyMap<number, Champion>;
  error: string | null;
  load: () => Promise<void>;
}

export const useChampionStore = create<ChampionState>((set, get) => ({
  version: null,
  champions: new Map(),
  error: null,

  load: async () => {
    if (get().version) return;
    try {
      const { version, champions } = await loadChampionData();
      set({ version, champions, error: null });
    } catch (error: unknown) {
      set({ error: `No se pudieron cargar los campeones: ${errorMessage(error)}` });
    }
  },
}));

export function useChampion(key: number): Champion | undefined {
  return useChampionStore((state) => state.champions.get(key));
}
