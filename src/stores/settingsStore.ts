import { create } from "zustand";
import { LazyStore } from "@tauri-apps/plugin-store";
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from "../features/settings/settings";
import { errorMessage } from "../lib/errors";

const STORE_FILE = "settings.json";
const STORE_KEY = "settings";

const persisted = new LazyStore(STORE_FILE);

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,
  error: null,

  load: async () => {
    try {
      const stored = await persisted.get<unknown>(STORE_KEY);
      set({ settings: mergeSettings(stored), loaded: true, error: null });
    } catch (error: unknown) {
      set({ loaded: true, error: `No se pudieron cargar los ajustes: ${errorMessage(error)}` });
    }
  },

  update: async (key, value) => {
    const next = mergeSettings({ ...get().settings, [key]: value });
    set({ settings: next });
    try {
      await persisted.set(STORE_KEY, next);
      await persisted.save();
      set({ error: null });
    } catch (error: unknown) {
      set({ error: `No se pudieron guardar los ajustes: ${errorMessage(error)}` });
    }
  },
}));
