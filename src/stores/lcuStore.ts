import { create } from "zustand";
import { getLcuStatus, lcuRequest, onLcuEvent, onLcuStatus, type LcuStatus } from "../lib/lcu";
import { errorMessage } from "../lib/errors";

const PHASE_PATH = "/lol-gameflow/v1/gameflow-phase";
const SUMMONER_PATH = "/lol-summoner/v1/current-summoner";
const MAX_ACTIVITY = 20;

export interface Summoner {
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
}

export interface ActivityEntry {
  id: number;
  time: Date;
  message: string;
}

interface LcuState {
  status: LcuStatus;
  phase: string | null;
  summoner: Summoner | null;
  activity: readonly ActivityEntry[];
  addActivity: (message: string) => void;
  init: () => () => void;
}

const DISCONNECTED: LcuStatus = { connected: false, port: null };
let nextActivityId = 1;

export const useLcuStore = create<LcuState>((set, get) => {
  async function refreshClientInfo(): Promise<void> {
    try {
      const [phase, summoner] = await Promise.all([
        lcuRequest<string>("GET", PHASE_PATH),
        lcuRequest<Summoner>("GET", SUMMONER_PATH),
      ]);
      set({ phase, summoner });
    } catch (error: unknown) {
      get().addActivity(`No se pudo leer el cliente: ${errorMessage(error)}`);
    }
  }

  function applyStatus(status: LcuStatus): void {
    const wasConnected = get().status.connected;
    set(status.connected ? { status } : { status, phase: null, summoner: null });
    if (status.connected && !wasConnected) {
      get().addActivity("Conectado al cliente de LoL");
      void refreshClientInfo();
    } else if (!status.connected && wasConnected) {
      get().addActivity("Cliente de LoL cerrado");
    }
  }

  return {
    status: DISCONNECTED,
    phase: null,
    summoner: null,
    activity: [],

    addActivity: (message) =>
      set((state) => ({
        activity: [{ id: nextActivityId++, time: new Date(), message }, ...state.activity].slice(
          0,
          MAX_ACTIVITY,
        ),
      })),

    init: () => {
      const unlisteners = [
        onLcuStatus(applyStatus),
        onLcuEvent((event) => {
          if (event.uri === PHASE_PATH && typeof event.data === "string") {
            set({ phase: event.data });
          } else if (event.uri === SUMMONER_PATH && event.data) {
            set({ summoner: event.data as Summoner });
          }
        }),
      ];

      getLcuStatus()
        .then(applyStatus)
        .catch((error: unknown) => get().addActivity(`Error de estado: ${errorMessage(error)}`));

      return () => {
        unlisteners.forEach((promise) => void promise.then((unlisten) => unlisten()));
      };
    },
  };
});
