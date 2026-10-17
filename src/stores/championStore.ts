import { create } from "zustand";
import {
  loadStaticData,
  type Champion,
  type Item,
  type Rune,
  type RuneStyle,
  type SummonerSpell,
} from "../lib/ddragon";
import { errorMessage } from "../lib/errors";

interface StaticState {
  version: string | null;
  champions: ReadonlyMap<number, Champion>;
  items: ReadonlyMap<number, Item>;
  runes: ReadonlyMap<number, Rune>;
  styles: ReadonlyMap<number, RuneStyle>;
  spells: ReadonlyMap<number, SummonerSpell>;
  error: string | null;
  load: () => Promise<void>;
}

/** Data Dragon static data (champions, items, runes, spells), loaded online on startup. */
export const useChampionStore = create<StaticState>((set, get) => ({
  version: null,
  champions: new Map(),
  items: new Map(),
  runes: new Map(),
  styles: new Map(),
  spells: new Map(),
  error: null,

  load: async () => {
    if (get().version) return;
    try {
      set({ ...(await loadStaticData()), error: null });
    } catch (error: unknown) {
      set({ error: `No se pudieron cargar los datos del juego: ${errorMessage(error)}` });
    }
  },
}));

export function useChampion(key: number): Champion | undefined {
  return useChampionStore((state) => state.champions.get(key));
}
