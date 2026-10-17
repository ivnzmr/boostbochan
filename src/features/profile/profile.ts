import { lcuRequest } from "../../lib/lcu";
import type { Role } from "../../lib/roles";

export const QUEUE_NAMES: Readonly<Record<number, string>> = {
  420: "Clasificatoria Solo/Dúo",
  440: "Clasificatoria Flexible",
  400: "Normal (reclutamiento)",
  430: "Normal (a ciegas)",
  490: "Partida rápida",
  450: "ARAM",
  1700: "Arena",
  900: "URF",
};

export const TIER_LABELS: Readonly<Record<string, string>> = {
  IRON: "Hierro",
  BRONZE: "Bronce",
  SILVER: "Plata",
  GOLD: "Oro",
  PLATINUM: "Platino",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Maestro",
  GRANDMASTER: "Gran Maestro",
  CHALLENGER: "Aspirante",
};

export interface RankedQueue {
  queueType: string;
  tier: string;
  division: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

export interface MatchSummary {
  gameId: number;
  createdAt: number;
  minutes: number;
  queueId: number;
  champ: number;
  role: Role | null;
  win: boolean;
  remake: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  vision: number;
  damage: number;
  items: number[];
  spells: [number, number];
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v !== null && typeof v === "object" ? (v as Rec) : {});
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const REMAKE_MINUTES = 5;

export function parseRanked(raw: unknown): RankedQueue[] {
  const queues = rec(raw).queues;
  if (!Array.isArray(queues)) return [];
  return queues
    .map(rec)
    .map((q) => ({
      queueType: str(q.queueType),
      tier: str(q.tier),
      division: str(q.division),
      leaguePoints: num(q.leaguePoints),
      wins: num(q.wins),
      losses: num(q.losses),
    }))
    .filter((q) => q.queueType === "RANKED_SOLO_5x5" || q.queueType === "RANKED_FLEX_SR");
}

/** Legacy match-history lane/role -> modern position. */
export function roleFromTimeline(lane: string, role: string): Role | null {
  switch (lane.toUpperCase()) {
    case "TOP":
      return "TOP";
    case "JUNGLE":
      return "JUNGLE";
    case "MID":
    case "MIDDLE":
      return "MIDDLE";
    case "BOT":
    case "BOTTOM":
      return role.toUpperCase() === "DUO_SUPPORT" || role.toUpperCase() === "SUPPORT" ? "UTILITY" : "BOTTOM";
    default:
      return null;
  }
}

/** Seconds in current clients; some older payloads used milliseconds. */
function durationMinutes(raw: number): number {
  const seconds = raw > 20_000 ? raw / 1000 : raw;
  return seconds / 60;
}

export function participantSummary(game: Rec, participant: Rec): MatchSummary {
  const stats = rec(participant.stats);
  const timeline = rec(participant.timeline);
  const minutes = durationMinutes(num(game.gameDuration));
  return {
    gameId: num(game.gameId),
    createdAt: num(game.gameCreation),
    minutes,
    queueId: num(game.queueId),
    champ: num(participant.championId),
    role: roleFromTimeline(str(timeline.lane), str(timeline.role)),
    win: stats.win === true,
    remake: minutes < REMAKE_MINUTES,
    kills: num(stats.kills),
    deaths: num(stats.deaths),
    assists: num(stats.assists),
    cs: num(stats.totalMinionsKilled) + num(stats.neutralMinionsKilled),
    gold: num(stats.goldEarned),
    vision: num(stats.visionScore),
    damage: num(stats.totalDamageDealtToChampions),
    items: [0, 1, 2, 3, 4, 5, 6].map((i) => num(stats[`item${i}`])),
    spells: [num(participant.spell1Id), num(participant.spell2Id)],
  };
}

/** The current-summoner history lists only the local player in each game. */
export function parseHistory(raw: unknown): MatchSummary[] {
  const games = rec(rec(raw).games).games;
  if (!Array.isArray(games)) return [];
  return games
    .map(rec)
    .filter((g) => Array.isArray(g.participants) && g.participants.length > 0)
    .map((g) => participantSummary(g, rec((g.participants as unknown[])[0])))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface ChampionSummary {
  champ: number;
  games: number;
  wins: number;
  kda: number;
}

export function championSummaries(matches: readonly MatchSummary[]): ChampionSummary[] {
  const byChamp = new Map<number, MatchSummary[]>();
  for (const m of matches.filter((m) => !m.remake)) byChamp.set(m.champ, [...(byChamp.get(m.champ) ?? []), m]);
  return [...byChamp.entries()]
    .map(([champ, list]) => {
      const sum = (f: (m: MatchSummary) => number) => list.reduce((s, m) => s + f(m), 0);
      return {
        champ,
        games: list.length,
        wins: list.filter((m) => m.win).length,
        kda: (sum((m) => m.kills) + sum((m) => m.assists)) / Math.max(1, sum((m) => m.deaths)),
      };
    })
    .sort((a, b) => b.games - a.games);
}

export const fetchRanked = (): Promise<RankedQueue[]> =>
  lcuRequest<unknown>("GET", "/lol-ranked/v1/current-ranked-stats").then(parseRanked);

export const fetchHistory = (count = 20): Promise<MatchSummary[]> =>
  lcuRequest<unknown>("GET", `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`).then(
    parseHistory,
  );
