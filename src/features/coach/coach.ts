import { lcuRequest } from "../../lib/lcu";
import type { Role } from "../../lib/roles";
import type { BenchRow } from "../../lib/stats";
import { participantSummary, type MatchSummary } from "../profile/profile";

/** Use the champion's own benchmark only with enough games, otherwise the role's. */
const MIN_CHAMP_BENCH_GAMES = 30;
const GOOD = 1.0;
const OK = 0.85;
const GOLD_PER_CS = 20;

export type MetricKey = "cs" | "gold" | "vision" | "deaths" | "damage" | "kp";

export interface PlayerGame extends MatchSummary {
  teamKills: number;
}

export interface MetricResult {
  key: MetricKey;
  label: string;
  value: number;
  target: number;
  /** >= 1 means at or better than Challenger/GM average. */
  ratio: number;
  format: (v: number) => string;
}

export interface CoachReport {
  grade: "S" | "A" | "B" | "C" | "D";
  score: number;
  benchLabel: string;
  metrics: MetricResult[];
  strengths: string[];
  tips: string[];
}

const perMin = (v: number) => `${v.toFixed(1)}/min`;
const percent = (v: number) => `${Math.round(v * 100)}%`;
const perTen = (v: number) => `${(v * 10).toFixed(1)}/10 min`;

/** Metrics that matter per role (supports don't farm; junglers' CS includes camps). */
const ROLE_METRICS: Readonly<Record<Role, MetricKey[]>> = {
  TOP: ["cs", "gold", "damage", "deaths", "kp", "vision"],
  JUNGLE: ["cs", "kp", "deaths", "vision", "damage", "gold"],
  MIDDLE: ["cs", "gold", "damage", "deaths", "kp", "vision"],
  BOTTOM: ["cs", "gold", "damage", "deaths", "kp", "vision"],
  UTILITY: ["vision", "kp", "deaths", "damage"],
};

const WEIGHTS: Readonly<Record<MetricKey, number>> = { cs: 1.2, gold: 1, damage: 1, deaths: 1.2, kp: 1, vision: 0.8 };

const LABELS: Readonly<Record<MetricKey, string>> = {
  cs: "Farmeo",
  gold: "Oro",
  vision: "Visión",
  deaths: "Muertes",
  damage: "Daño a campeones",
  kp: "Participación en asesinatos",
};

function playerValue(key: MetricKey, g: PlayerGame): number {
  const m = Math.max(g.minutes, 1);
  switch (key) {
    case "cs":
      return g.cs / m;
    case "gold":
      return g.gold / m;
    case "vision":
      return g.vision / m;
    case "deaths":
      return g.deaths / m;
    case "damage":
      return g.damage / m;
    case "kp":
      return g.teamKills > 0 ? (g.kills + g.assists) / g.teamKills : 0;
  }
}

function benchValue(key: MetricKey, b: BenchRow): number {
  const m = Math.max(b.minutes, 1);
  switch (key) {
    case "cs":
      return b.cs / m;
    case "gold":
      return b.gold / m;
    case "vision":
      return b.vision / m;
    case "deaths":
      return b.deaths / m;
    case "damage":
      return b.damage / m;
    case "kp":
      return b.games > 0 ? b.kp / b.games : 0;
  }
}

const FORMATS: Readonly<Record<MetricKey, (v: number) => string>> = {
  cs: perMin,
  gold: (v) => `${Math.round(v)}/min`,
  vision: (v) => `${v.toFixed(2)}/min`,
  deaths: perTen,
  damage: (v) => `${Math.round(v)}/min`,
  kp: percent,
};

function ratioFor(key: MetricKey, value: number, target: number): number {
  if (target <= 0) return 1;
  // Fewer deaths is better: invert, and cap so a deathless game doesn't explode the score.
  if (key === "deaths") return Math.min(2, target / Math.max(value, target * 0.25));
  return value / target;
}

function tipFor(m: MetricResult, g: PlayerGame, championName: string): string {
  const show = (v: number) => m.format(v);
  switch (m.key) {
    case "cs": {
      const missed = Math.round((m.target - m.value) * g.minutes);
      return `Farmeo: ${show(m.value)} frente a ${show(m.target)} de Challenger con ${championName}. Te faltaron ~${missed} súbditos (≈${(missed * GOLD_PER_CS).toLocaleString("es-ES")} de oro). Empuja la oleada antes de rotar o volver a base y no pierdas los súbditos de cañón.`;
    }
    case "gold":
      return `Oro: ${show(m.value)} frente a ${show(m.target)}. Además de farmear mejor, busca placas de torre antes del minuto 14 y no te quedes sin hacer nada tras pelear.`;
    case "vision":
      return `Visión: ${show(m.value)} frente a ${show(m.target)}. Compra un Centinela de control en cada regreso a base, cambia a la lente de barrido si eres jungla o support, y coloca guardianes antes de cada objetivo.`;
    case "deaths":
      return `Muertes: ${g.deaths} (${show(m.value)}) frente a ${show(m.target)} de media en Challenger. Antes de avanzar sin visión, mira el minimapa y piensa dónde está el jungla rival.`;
    case "damage":
      return `Daño: ${show(m.value)} frente a ${show(m.target)}. Busca más intercambios en línea cuando tengas ventaja de nivel u objeto, y en las peleas colócate para poder golpear sin morir primero.`;
    case "kp":
      return `Participación: ${show(m.value)} frente a ${show(m.target)}. Ve a las peleas de objetivos (dragón, Heraldo, Barón) y usa el teletransporte o los rotes para ayudar a tu equipo.`;
  }
}

function grade(score: number): CoachReport["grade"] {
  if (score >= 1.15) return "S";
  if (score >= 1.0) return "A";
  if (score >= 0.88) return "B";
  if (score >= 0.75) return "C";
  return "D";
}

export function analyzeGame(
  game: PlayerGame,
  role: Role,
  champBench: BenchRow | null,
  roleBench: BenchRow | null,
  championName: string,
): CoachReport | null {
  const useChamp = champBench !== null && champBench.games >= MIN_CHAMP_BENCH_GAMES;
  const bench = useChamp ? champBench : roleBench;
  if (!bench || bench.games === 0) return null;

  const metrics: MetricResult[] = ROLE_METRICS[role].map((key) => {
    const value = playerValue(key, game);
    const target = benchValue(key, bench);
    return { key, label: LABELS[key], value, target, ratio: ratioFor(key, value, target), format: FORMATS[key] };
  });

  const totalWeight = metrics.reduce((s, m) => s + WEIGHTS[m.key], 0);
  const score = metrics.reduce((s, m) => s + Math.min(m.ratio, 1.5) * WEIGHTS[m.key], 0) / totalWeight;

  const weakest = metrics.filter((m) => m.ratio < OK).sort((a, b) => a.ratio - b.ratio);
  const tips = weakest.slice(0, 3).map((m) => tipFor(m, game, championName));
  if (tips.length === 0) {
    tips.push("Gran partida: estás al nivel de Challenger en todo lo que medimos. Sigue así y fíjate en el control de objetivos.");
  }
  const strengths = metrics
    .filter((m) => m.ratio >= GOOD)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((m) => `${m.label}: ${m.format(m.value)} (Challenger: ${m.format(m.target)})`);

  return {
    grade: grade(score),
    score,
    benchLabel: useChamp ? `${championName} en Challenger/GM` : "tu rol en Challenger/GM",
    metrics,
    strengths,
    tips,
  };
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v !== null && typeof v === "object" ? (v as Rec) : {});

/** Extracts the local player (by puuid) from a full LCU game, with team kills. */
export function playerFromGame(raw: unknown, puuid: string): PlayerGame | null {
  const game = rec(raw);
  const identities = Array.isArray(game.participantIdentities) ? game.participantIdentities.map(rec) : [];
  const participants = Array.isArray(game.participants) ? game.participants.map(rec) : [];
  const me = identities.find((i) => rec(i.player).puuid === puuid);
  const participant = participants.find((p) => p.participantId === me?.participantId);
  if (!participant) return null;
  const teamKills = participants
    .filter((p) => p.teamId === participant.teamId)
    .reduce((s, p) => s + (typeof rec(p.stats).kills === "number" ? (rec(p.stats).kills as number) : 0), 0);
  return { ...participantSummary(game, participant), teamKills };
}

export async function fetchPlayerGame(gameId: number): Promise<PlayerGame | null> {
  const [summoner, game] = await Promise.all([
    lcuRequest<{ puuid: string }>("GET", "/lol-summoner/v1/current-summoner"),
    lcuRequest<unknown>("GET", `/lol-match-history/v1/games/${gameId}`),
  ]);
  return playerFromGame(game, summoner.puuid);
}
