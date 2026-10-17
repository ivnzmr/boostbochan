import { useEffect, useState } from "react";
import { lcuRequest, onLcuEvent } from "../../lib/lcu";
import { useLcuStore } from "../../stores/lcuStore";
import { SESSION_PATH, parseSession, type SessionView } from "./session";

const OWNED_PATH = "/lol-champions/v1/owned-champions-minimal";
const MASTERY_PATH = "/lol-champion-mastery/v1/local-player/champion-mastery";

/** Live champ select session while the client is in ChampSelect, otherwise null. */
export function useLiveSession(): SessionView | null {
  const phase = useLcuStore((state) => state.phase);
  const [view, setView] = useState<SessionView | null>(null);

  useEffect(() => {
    if (phase !== "ChampSelect") {
      setView(null);
      return;
    }
    let active = true;
    lcuRequest<unknown>("GET", SESSION_PATH)
      .then((raw) => active && setView(parseSession(raw)))
      .catch(() => active && setView(null));

    const unlisten = onLcuEvent((event) => {
      if (event.uri !== SESSION_PATH) return;
      setView(event.eventType === "Delete" ? null : parseSession(event.data));
    });
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, [phase]);

  return view;
}

export interface Mastery {
  championId: number;
  championLevel: number;
  championPoints: number;
}

export interface PlayerPool {
  owned: ReadonlySet<number> | null;
  mastery: ReadonlyMap<number, Mastery>;
}

const EMPTY_POOL: PlayerPool = { owned: null, mastery: new Map() };

function isMasteryList(value: unknown): value is Mastery[] {
  return Array.isArray(value) && value.every((m) => typeof m?.championId === "number");
}

/** Owned champions and mastery of the logged-in player (used to filter recommendations). */
export function usePlayerPool(): PlayerPool {
  const connected = useLcuStore((state) => state.status.connected);
  const [pool, setPool] = useState<PlayerPool>(EMPTY_POOL);

  useEffect(() => {
    if (!connected) {
      setPool(EMPTY_POOL);
      return;
    }
    let active = true;
    Promise.all([
      lcuRequest<{ id: number }[]>("GET", OWNED_PATH).catch(() => null),
      lcuRequest<unknown>("GET", MASTERY_PATH).catch(() => null),
    ]).then(([owned, mastery]) => {
      if (!active) return;
      setPool({
        owned: Array.isArray(owned) ? new Set(owned.map((c) => c.id)) : null,
        mastery: isMasteryList(mastery) ? new Map(mastery.map((m) => [m.championId, m])) : new Map(),
      });
    });
    return () => {
      active = false;
    };
  }, [connected]);

  return pool;
}
