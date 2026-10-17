import type { Role } from "../../lib/roles";
import type { ChampRow } from "../../lib/stats";
import { PRO_WEIGHT, smoothed } from "../champselect/counters";

export type Tier = "S+" | "S" | "A" | "B" | "C";

/** Champions under this pick rate are too niche to rank. */
export const MIN_PICK_RATE = 0.005;
const TIER_PRIOR_GAMES = 100;
/** Cumulative share of ranked champions that falls into each tier. */
const TIER_CUTOFFS: readonly [number, Tier][] = [
  [0.05, "S+"],
  [0.2, "S"],
  [0.45, "A"],
  [0.75, "B"],
  [1, "C"],
];

export interface TierEntry {
  champ: number;
  games: number;
  winRate: number;
  pickRate: number;
  proGames: number;
  tier: Tier;
}

export function tierForRank(index: number, count: number): Tier {
  const share = (index + 1) / count;
  return TIER_CUTOFFS.find(([cutoff]) => share <= cutoff)?.[1] ?? "C";
}

export function buildTierList(rows: readonly ChampRow[], role: Role, soloqMatches: number): TierEntry[] {
  if (soloqMatches <= 0) return [];
  const roleRows = rows.filter((r) => r.role === role);
  const champs = [...new Set(roleRows.map((r) => r.champ))];

  const ranked = champs
    .map((champ) => {
      const soloq = roleRows.find((r) => r.champ === champ && r.source === "soloq");
      const pro = roleRows.find((r) => r.champ === champ && r.source === "pro");
      const games = soloq?.games ?? 0;
      const weightedGames = games + (pro?.games ?? 0) * PRO_WEIGHT;
      const weightedWins = (soloq?.wins ?? 0) + (pro?.wins ?? 0) * PRO_WEIGHT;
      return {
        champ,
        games,
        winRate: games > 0 ? (soloq?.wins ?? 0) / games : 0,
        pickRate: games / soloqMatches,
        proGames: pro?.games ?? 0,
        // Ranking uses a shrunk win rate so 10-game wonders don't top the list.
        strength: smoothed(weightedWins, weightedGames, 0.5, TIER_PRIOR_GAMES),
      };
    })
    .filter((e) => e.pickRate >= MIN_PICK_RATE)
    .sort((a, b) => b.strength - a.strength);

  return ranked.map(({ strength: _strength, ...entry }, index) => ({
    ...entry,
    tier: tierForRank(index, ranked.length),
  }));
}
