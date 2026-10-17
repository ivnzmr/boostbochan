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

export type BuildKind = "item" | "core" | "rune" | "spell" | "skill";

/** Enemy team damage profile: 0 mixed, 1 AD heavy, 2 AP heavy; 255 = not bucketed. */
export type Bucket = 0 | 1 | 2;
export const BUCKET_ANY = 255;

export interface BuildRow {
  source: Source;
  role: Role;
  champ: number;
  kind: BuildKind;
  bucket: number;
  key: string;
  games: number;
  wins: number;
}

/** Sums over `games` games (divide to get per-game / per-minute averages). */
export interface BenchRow {
  role: Role;
  champ: number;
  games: number;
  minutes: number;
  cs: number;
  gold: number;
  vision: number;
  deaths: number;
  damage: number;
  kp: number;
}

export interface BuildData {
  rows: BuildRow[];
  champBench: BenchRow | null;
  roleBench: BenchRow | null;
}

export const getBuildData = (role: Role, champ: number): Promise<BuildData> =>
  invoke("stats_build", { role, champ });

export function onStatsUpdated(callback: () => void): Promise<UnlistenFn> {
  return listen("stats-updated", () => callback());
}
