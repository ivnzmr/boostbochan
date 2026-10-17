import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Role } from "./roles";

export type Source = "soloq" | "pro";

export interface ChampRow {
  source: Source;
  role: Role;
  champ: number;
  games: number;
  wins: number;
}

export interface MatchupRow {
  source: Source;
  champ: number;
  enemy: number;
  enemyRole: Role;
  games: number;
  wins: number;
}

export interface StatsSummary {
  soloqGames: number;
  proGames: number;
  patches: string[];
  /** Unix seconds when the published snapshot was built, null if none downloaded yet. */
  generatedAt: number | null;
  syncing: boolean;
  lastError: string | null;
}

export const getSummary = (): Promise<StatsSummary> => invoke("stats_summary");
export const getChampionRows = (): Promise<ChampRow[]> => invoke("stats_champions");
export const getMatchups = (role: Role, enemies: number[]): Promise<MatchupRow[]> =>
  invoke("stats_matchups", { role, enemies });
export const syncStats = (): Promise<void> => invoke("stats_sync");

export function onStatsUpdated(callback: () => void): Promise<UnlistenFn> {
  return listen("stats-updated", () => callback());
}
