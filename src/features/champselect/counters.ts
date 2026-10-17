import { ROLES, type Role } from "../../lib/roles";
import type { ChampRow, MatchupRow, Source } from "../../lib/stats";
import type { EnemyPick } from "./session";

/** A professional game is worth this many high-elo soloQ games. */
export const PRO_WEIGHT = 3;
/** Bayesian prior strength (in games) used to shrink small samples. */
export const PRIOR_GAMES = 20;
/** Minimum weighted games in a role before a champion is recommended. */
export const MIN_ROLE_GAMES = 30;
export const LANE_WEIGHT = 1;
export const OFF_LANE_WEIGHT = 0.35;

interface Tally {
  games: number;
  wins: number;
}

function weight(source: Source): number {
  return source === "pro" ? PRO_WEIGHT : 1;
}

function tally<T extends { source: Source; games: number; wins: number }>(rows: readonly T[]): Tally {
  return rows.reduce(
    (acc, r) => ({ games: acc.games + r.games * weight(r.source), wins: acc.wins + r.wins * weight(r.source) }),
    { games: 0, wins: 0 },
  );
}

export function smoothed(wins: number, games: number, prior: number, k: number = PRIOR_GAMES): number {
  return (wins + k * prior) / (games + k);
}

const logit = (p: number): number => Math.log(p / (1 - p));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/**
 * Assigns the most likely role to enemies whose role is unknown, using how often
 * each champion is played in each role. Greedy, one enemy per role.
 */
export function inferEnemyRoles(enemies: readonly EnemyPick[], champRows: readonly ChampRow[]): EnemyPick[] {
  const takenRoles = new Set(enemies.map((e) => e.role).filter((r): r is Role => r !== null));

  const candidates = enemies
    .map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy }) => enemy.role === null && enemy.champ > 0)
    .flatMap(({ enemy, index }) => {
      const rows = champRows.filter((r) => r.champ === enemy.champ);
      const total = tally(rows).games;
      return ROLES.map((role) => ({
        index,
        role,
        p: total > 0 ? tally(rows.filter((r) => r.role === role)).games / total : 0,
      }));
    })
    .filter((c) => c.p > 0)
    .sort((a, b) => b.p - a.p);

  const assigned = new Map<number, Role>();
  for (const { index, role } of candidates) {
    if (!assigned.has(index) && !takenRoles.has(role)) {
      assigned.set(index, role);
      takenRoles.add(role);
    }
  }
  return enemies.map((enemy, index) => ({ ...enemy, role: enemy.role ?? assigned.get(index) ?? null }));
}

export interface MatchupEdge {
  enemy: number;
  enemyRole: Role | null;
  winRate: number;
  games: number;
  lane: boolean;
}

export interface Recommendation {
  champ: number;
  /** Expected win rate against the visible enemy team. */
  score: number;
  baseWinRate: number;
  games: number;
  proGames: number;
  edges: MatchupEdge[];
}

export interface CounterInput {
  role: Role;
  enemies: readonly EnemyPick[];
  champRows: readonly ChampRow[];
  matchupRows: readonly MatchupRow[];
  unavailable?: ReadonlySet<number>;
  pool?: ReadonlySet<number> | null;
}

function edgeFor(champ: number, enemy: EnemyPick, role: Role, baseWinRate: number, rows: readonly MatchupRow[]): MatchupEdge {
  const relevant = rows.filter(
    (r) => r.champ === champ && r.enemy === enemy.champ && (enemy.role === null || r.enemyRole === enemy.role),
  );
  const t = tally(relevant);
  return {
    enemy: enemy.champ,
    enemyRole: enemy.role,
    winRate: smoothed(t.wins, t.games, baseWinRate),
    games: relevant.reduce((sum, r) => sum + r.games, 0),
    lane: enemy.role === role,
  };
}

/** Ranks champions for `role` by expected win rate against the enemy picks (log-odds additive model). */
export function scoreCounters(input: CounterInput): Recommendation[] {
  const { role, champRows, matchupRows, unavailable, pool } = input;
  const enemies = input.enemies.filter((e) => e.champ > 0);

  const byChamp = new Map<number, ChampRow[]>();
  for (const row of champRows) {
    if (row.role === role) byChamp.set(row.champ, [...(byChamp.get(row.champ) ?? []), row]);
  }

  return [...byChamp.entries()]
    .filter(([champ]) => !unavailable?.has(champ) && (!pool || pool.has(champ)))
    .map(([champ, rows]) => ({ champ, rows, t: tally(rows) }))
    .filter(({ t }) => t.games >= MIN_ROLE_GAMES)
    .map(({ champ, rows, t }) => {
      const baseWinRate = smoothed(t.wins, t.games, 0.5);
      const edges = enemies.map((enemy) => edgeFor(champ, enemy, role, baseWinRate, matchupRows));
      const shift = edges.reduce(
        (sum, e) => sum + (e.lane ? LANE_WEIGHT : OFF_LANE_WEIGHT) * (logit(e.winRate) - logit(baseWinRate)),
        0,
      );
      return {
        champ,
        score: sigmoid(logit(baseWinRate) + shift),
        baseWinRate,
        games: rows.filter((r) => r.source === "soloq").reduce((s, r) => s + r.games, 0),
        proGames: rows.filter((r) => r.source === "pro").reduce((s, r) => s + r.games, 0),
        edges,
      };
    })
    .sort((a, b) => b.score - a.score);
}
