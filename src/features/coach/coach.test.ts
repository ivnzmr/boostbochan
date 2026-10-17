import { describe, expect, it } from "vitest";
import type { BenchRow } from "../../lib/stats";
import { analyzeGame, playerFromGame, type PlayerGame } from "./coach";

// Challenger average over 10 games of 30 min: 8 cs/min, 450 gold/min, 1 vision/min,
// 0.15 deaths/min, 900 dmg/min, 55% kill participation.
const bench: BenchRow = {
  role: "MIDDLE",
  champ: 103,
  games: 100,
  minutes: 3000,
  cs: 24000,
  gold: 1_350_000,
  vision: 3000,
  deaths: 450,
  damage: 2_700_000,
  kp: 55,
};

const game = (overrides: Partial<PlayerGame> = {}): PlayerGame => ({
  gameId: 1,
  createdAt: 0,
  minutes: 30,
  queueId: 420,
  champ: 103,
  role: "MIDDLE",
  win: true,
  remake: false,
  kills: 6,
  deaths: 4,
  assists: 6,
  cs: 240,
  gold: 13500,
  vision: 30,
  damage: 27000,
  items: [],
  spells: [4, 14],
  teamKills: 22,
  ...overrides,
});

describe("analyzeGame", () => {
  it("grades a Challenger-level game highly with no improvement tips", () => {
    const report = analyzeGame(game(), "MIDDLE", bench, null, "Ahri")!;
    expect(["S", "A"]).toContain(report.grade);
    expect(report.benchLabel).toBe("Ahri en Challenger/GM");
    expect(report.tips[0]).toMatch(/Gran partida/);
  });

  it("points at the weakest areas with concrete numbers", () => {
    const report = analyzeGame(game({ cs: 150, vision: 10, deaths: 10 }), "MIDDLE", bench, null, "Ahri")!;
    expect(report.grade).not.toBe("S");
    expect(report.tips).toHaveLength(3);
    expect(report.tips.join(" ")).toMatch(/Te faltaron ~90 súbditos/);
    expect(report.tips.some((t) => t.startsWith("Visión"))).toBe(true);
    expect(report.tips.some((t) => t.startsWith("Muertes: 10"))).toBe(true);
  });

  it("uses the role benchmark when the champion sample is small", () => {
    const report = analyzeGame(game(), "MIDDLE", { ...bench, games: 5 }, bench, "Ahri")!;
    expect(report.benchLabel).toBe("tu rol en Challenger/GM");
  });

  it("does not judge supports on farm", () => {
    const report = analyzeGame(game({ cs: 20 }), "UTILITY", bench, null, "Lulu")!;
    expect(report.metrics.map((m) => m.key)).not.toContain("cs");
  });

  it("returns null without benchmark data", () => {
    expect(analyzeGame(game(), "MIDDLE", null, null, "Ahri")).toBeNull();
  });
});

describe("playerFromGame", () => {
  it("finds the local player and team kills", () => {
    const raw = {
      gameId: 9,
      gameDuration: 1800,
      gameCreation: 1,
      queueId: 420,
      participantIdentities: [
        { participantId: 1, player: { puuid: "me" } },
        { participantId: 2, player: { puuid: "ally" } },
        { participantId: 6, player: { puuid: "enemy" } },
      ],
      participants: [
        { participantId: 1, teamId: 100, championId: 103, stats: { kills: 5, assists: 3, win: true }, timeline: { lane: "MIDDLE" } },
        { participantId: 2, teamId: 100, championId: 64, stats: { kills: 7 } },
        { participantId: 6, teamId: 200, championId: 7, stats: { kills: 20 } },
      ],
    };
    const player = playerFromGame(raw, "me")!;
    expect(player).toMatchObject({ champ: 103, teamKills: 12, kills: 5, win: true, role: "MIDDLE" });
    expect(playerFromGame(raw, "nobody")).toBeNull();
  });
});
