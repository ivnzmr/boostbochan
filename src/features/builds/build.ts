import type { Item } from "../../lib/ddragon";
import type { Role } from "../../lib/roles";
import type { Bucket, BuildKind, BuildRow } from "../../lib/stats";
import { smoothed } from "../champselect/counters";

/** A key needs at least this share of the most popular option's games to be considered. */
const POPULARITY_FLOOR = 0.25;
/** Below this many games for the enemy profile, fall back to all games. */
const MIN_BUCKET_GAMES = 20;
const SITUATIONAL_COUNT = 6;
const HEALTH_POTION = 2003;
const FLASH = 4;

export interface Choice<T> {
  value: T;
  games: number;
  winRate: number;
}

export interface RunePage {
  primaryStyle: number;
  subStyle: number;
  /** 4 primary + 2 secondary + 3 shards (offense, flex, defense), LCU order. */
  perks: number[];
}

export interface SkillOrder {
  /** Basic abilities by max priority, e.g. "QEW". */
  priority: string;
  /** Skill letter for each level 1..18. */
  levels: string[];
}

export interface ItemStat {
  item: number;
  games: number;
  winRate: number;
  pickRate: number;
}

export interface Build {
  games: number;
  runes: Choice<RunePage> | null;
  spells: Choice<[number, number]> | null;
  skills: Choice<SkillOrder> | null;
  starters: number[];
  core: Choice<number[]> | null;
  boots: Choice<number> | null;
  situational: ItemStat[];
}

interface Tally {
  key: string;
  games: number;
  wins: number;
}

function tallyBy(rows: readonly BuildRow[]): Tally[] {
  const map = new Map<string, Tally>();
  for (const r of rows) {
    const t = map.get(r.key) ?? { key: r.key, games: 0, wins: 0 };
    map.set(r.key, { ...t, games: t.games + r.games, wins: t.wins + r.wins });
  }
  return [...map.values()].sort((a, b) => b.games - a.games);
}

/** Among reasonably popular options, the one with the best (shrunk) win rate. */
export function bestKey(rows: readonly BuildRow[]): Tally | null {
  const tallies = tallyBy(rows);
  const top = tallies[0];
  if (!top) return null;
  const total = tallies.reduce((s, t) => ({ games: s.games + t.games, wins: s.wins + t.wins }), { games: 0, wins: 0 });
  const prior = total.games > 0 ? total.wins / total.games : 0.5;
  return tallies
    .filter((t) => t.games >= top.games * POPULARITY_FLOOR)
    .reduce((best, t) => (smoothed(t.wins, t.games, prior) > smoothed(best.wins, best.games, prior) ? t : best));
}

function choice<T>(tally: Tally | null, parse: (key: string) => T | null): Choice<T> | null {
  if (!tally) return null;
  const value = parse(tally.key);
  return value === null ? null : { value, games: tally.games, winRate: tally.wins / tally.games };
}

export function parseRunes(key: string): RunePage | null {
  const [primary, sub, main, secondary, shards] = key.split(":");
  const ids = (s: string | undefined) => (s ? s.split(",").map(Number) : []);
  const perks = [...ids(main), ...ids(secondary), ...ids(shards)];
  if (perks.length !== 9 || perks.some((p) => !Number.isInteger(p) || p <= 0)) return null;
  return { primaryStyle: Number(primary), subStyle: Number(sub), perks };
}

function parseSpells(key: string): [number, number] | null {
  const [a, b] = key.split(",").map(Number);
  return a && b ? [a, b] : null;
}

/** "QEW|QWE" -> level-by-level order: first three as played, R at 6/11/16, then by priority. */
export function parseSkills(key: string): SkillOrder | null {
  const [priority, first3] = key.split("|");
  if (!priority || priority.length !== 3 || !first3 || first3.length !== 3) return null;
  const counts: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 };
  const levels: string[] = [];
  for (let level = 1; level <= 18; level++) {
    const pick =
      level <= 3
        ? first3[level - 1]
        : [6, 11, 16].includes(level)
          ? "R"
          : [...priority].find((s) => counts[s] < 5) ?? "R";
    counts[pick] = (counts[pick] ?? 0) + 1;
    levels.push(pick);
  }
  return { priority, levels };
}

function parseCore(key: string): number[] | null {
  const items = key.split("-").map(Number);
  return items.length > 0 && items.every((i) => Number.isInteger(i) && i > 0) ? items : null;
}

/** Rows of `kind` for the enemy profile, or all profiles when that sample is too small. */
function forBucket(rows: readonly BuildRow[], kind: BuildKind, bucket: Bucket): BuildRow[] {
  const ofKind = rows.filter((r) => r.kind === kind);
  const inBucket = ofKind.filter((r) => r.bucket === bucket);
  return inBucket.reduce((s, r) => s + r.games, 0) >= MIN_BUCKET_GAMES ? inBucket : ofKind;
}

export function starterItems(role: Role, isAp: boolean): number[] {
  const first: Record<Role, number> = {
    TOP: isAp ? 1056 : 1055,
    JUNGLE: 1102,
    MIDDLE: isAp ? 1056 : 1055,
    BOTTOM: 1055,
    UTILITY: 3865,
  };
  return [first[role], HEALTH_POTION];
}

export interface BuildInput {
  rows: readonly BuildRow[];
  role: Role;
  bucket: Bucket;
  isAp: boolean;
  items: ReadonlyMap<number, Item>;
}

export function computeBuild({ rows, role, bucket, isAp, items }: BuildInput): Build {
  const games = rows.filter((r) => r.kind === "spell").reduce((s, r) => s + r.games, 0);
  const core = choice(bestKey(forBucket(rows, "core", bucket)), parseCore);
  const coreItems = new Set(core?.value ?? []);

  const itemRows = forBucket(rows, "item", bucket);
  // Games aren't stored per profile; estimate them from the profile's share of item picks.
  const sumGames = (list: readonly BuildRow[]) => list.reduce((s, r) => s + r.games, 0);
  const allItemGames = sumGames(rows.filter((r) => r.kind === "item"));
  const itemGames = Math.max(1, allItemGames > 0 ? (games * sumGames(itemRows)) / allItemGames : games);
  const bootRows = rows.filter((r) => r.kind === "item" && items.get(Number(r.key))?.boots);
  const boots = choice(bestKey(bootRows), (k) => Number(k) || null);

  const situational = tallyBy(itemRows)
    .map((t) => ({ item: Number(t.key), games: t.games, winRate: t.wins / t.games, pickRate: t.games / itemGames }))
    .filter((s) => items.get(s.item)?.completed && !coreItems.has(s.item))
    .slice(0, SITUATIONAL_COUNT);

  return {
    games,
    runes: choice(bestKey(rows.filter((r) => r.kind === "rune")), parseRunes),
    spells: choice(bestKey(rows.filter((r) => r.kind === "spell")), parseSpells),
    skills: choice(bestKey(rows.filter((r) => r.kind === "skill")), parseSkills),
    starters: starterItems(role, isAp),
    core,
    boots,
    situational,
  };
}

/** Keeps Flash (and any spell the player already has) in the slot they use it. */
export function orderSpells(recommended: [number, number], current: [number, number]): [number, number] {
  const [a, b] = recommended;
  const keepSlot = (spell: number): 0 | 1 | null => (current[0] === spell ? 0 : current[1] === spell ? 1 : null);
  const flashSlot = keepSlot(FLASH) ?? 1;
  if (a === FLASH || b === FLASH) {
    const other = a === FLASH ? b : a;
    return flashSlot === 0 ? [FLASH, other] : [other, FLASH];
  }
  if (keepSlot(a) === 1 || keepSlot(b) === 0) return [b, a];
  return [a, b];
}
