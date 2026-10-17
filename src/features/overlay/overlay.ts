import { invoke } from "@tauri-apps/api/core";
import { championIdFromRaw } from "../../lib/ddragon";
import { roleFromLcu, type Role } from "../../lib/roles";
import type { Build } from "../builds/build";

export interface LiveView {
  /** Data Dragon champion id, e.g. "Ahri". */
  championId: string;
  role: Role | null;
  gold: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gameMinutes: number;
  items: number[];
  enemyChampionIds: string[];
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v !== null && typeof v === "object" ? (v as Rec) : {});
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Parses Riot's Live Client Data `allgamedata`; null when there is no game. */
export function parseLiveData(raw: unknown): LiveView | null {
  const data = rec(raw);
  const active = rec(data.activePlayer);
  const players = Array.isArray(data.allPlayers) ? data.allPlayers.map(rec) : [];
  const name = str(active.riotIdGameName) || str(active.summonerName);
  const me = players.find(
    (p) => (name && (str(p.riotIdGameName) === name || str(p.summonerName) === name)) || (active.riotId && p.riotId === active.riotId),
  );
  if (!me) return null;
  const scores = rec(me.scores);
  return {
    championId: championIdFromRaw(str(me.rawChampionName)) || str(me.championName),
    role: roleFromLcu(str(me.position)),
    gold: num(active.currentGold),
    level: num(active.level) || num(me.level),
    kills: num(scores.kills),
    deaths: num(scores.deaths),
    assists: num(scores.assists),
    cs: num(scores.creepScore),
    gameMinutes: num(rec(data.gameData).gameTime) / 60,
    items: (Array.isArray(me.items) ? me.items.map(rec) : []).map((i) => num(i.itemID)).filter((id) => id > 0),
    enemyChampionIds: players.filter((p) => p.team !== me.team).map((p) => championIdFromRaw(str(p.rawChampionName))),
  };
}

/** Next item to buy: first core item, then boots, then situational, that isn't owned yet. */
export function nextItem(build: Build | null, inventory: readonly number[]): number | null {
  if (!build) return null;
  const owned = new Set(inventory);
  const order = [...(build.core?.value ?? []), ...(build.boots ? [build.boots.value] : []), ...build.situational.map((s) => s.item)];
  return order.find((item) => !owned.has(item)) ?? null;
}

export const fetchLiveData = (): Promise<unknown> => invoke("live_game_data");
export const setOverlayVisible = (visible: boolean): Promise<void> => invoke("overlay_set_visible", { visible });
