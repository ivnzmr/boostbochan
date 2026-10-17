import { describe, expect, it } from "vitest";
import type { ChampRow, MatchupRow } from "../../lib/stats";
import { MIN_ROLE_GAMES, inferEnemyRoles, scoreCounters, smoothed } from "./counters";

const DARIUS = 122;
const TEEMO = 17;
const GAREN = 86;
const MALPHITE = 54;
const LEE = 64;

const champRows: ChampRow[] = [
  { source: "soloq", role: "TOP", champ: TEEMO, games: 400, wins: 200 },
  { source: "soloq", role: "TOP", champ: GAREN, games: 400, wins: 208 },
  { source: "soloq", role: "TOP", champ: MALPHITE, games: 300, wins: 150 },
  { source: "pro", role: "TOP", champ: MALPHITE, games: 30, wins: 24 },
  { source: "soloq", role: "TOP", champ: DARIUS, games: 500, wins: 250 },
  { source: "soloq", role: "JUNGLE", champ: LEE, games: 500, wins: 250 },
  { source: "soloq", role: "TOP", champ: LEE, games: 20, wins: 10 },
];

const matchupRows: MatchupRow[] = [
  // Teemo crushes Darius in lane, Garen loses to him.
  { source: "soloq", champ: TEEMO, enemy: DARIUS, enemyRole: "TOP", games: 200, wins: 124 },
  { source: "soloq", champ: GAREN, enemy: DARIUS, enemyRole: "TOP", games: 200, wins: 84 },
  { source: "soloq", champ: MALPHITE, enemy: DARIUS, enemyRole: "TOP", games: 100, wins: 52 },
];

describe("smoothed", () => {
  it("shrinks small samples toward the prior", () => {
    expect(smoothed(1, 1, 0.5)).toBeCloseTo(0.5238, 3);
    expect(smoothed(600, 1000, 0.5)).toBeCloseTo(0.598, 2);
  });
});

describe("inferEnemyRoles", () => {
  it("assigns each enemy its most played free role", () => {
    const result = inferEnemyRoles(
      [
        { champ: DARIUS, role: null },
        { champ: LEE, role: null },
      ],
      champRows,
    );
    expect(result.map((e) => e.role)).toEqual(["TOP", "JUNGLE"]);
  });

  it("keeps known roles and never duplicates them", () => {
    const result = inferEnemyRoles(
      [
        { champ: LEE, role: "TOP" },
        { champ: DARIUS, role: null },
      ],
      champRows,
    );
    expect(result[0].role).toBe("TOP");
    expect(result[1].role).toBeNull();
  });

  it("leaves empty slots and unknown champions alone", () => {
    expect(inferEnemyRoles([{ champ: 0, role: null }, { champ: 9999, role: null }], champRows)).toEqual([
      { champ: 0, role: null },
      { champ: 9999, role: null },
    ]);
  });
});

describe("scoreCounters", () => {
  it("ranks the best lane counter first", () => {
    const recs = scoreCounters({ role: "TOP", enemies: [{ champ: DARIUS, role: "TOP" }], champRows, matchupRows });
    expect(recs[0].champ).toBe(TEEMO);
    expect(recs[0].score).toBeGreaterThan(0.55);
    expect(recs[recs.length - 1]?.champ).not.toBe(TEEMO);
    const garen = recs.find((r) => r.champ === GAREN)!;
    expect(garen.score).toBeLessThan(garen.baseWinRate);
    expect(recs[0].edges[0]).toMatchObject({ enemy: DARIUS, lane: true, games: 200 });
  });

  it("falls back to base win rate with no enemies", () => {
    const recs = scoreCounters({ role: "TOP", enemies: [], champRows, matchupRows });
    expect(recs[0].champ).toBe(MALPHITE); // pro games weighted ×3 lift its win rate
    expect(recs[0].proGames).toBe(30);
  });

  it("excludes unavailable champions, small samples and champions outside the pool", () => {
    const recs = scoreCounters({
      role: "TOP",
      enemies: [{ champ: DARIUS, role: "TOP" }],
      champRows,
      matchupRows,
      unavailable: new Set([TEEMO]),
      pool: new Set([GAREN, MALPHITE, TEEMO, LEE]),
    });
    const ids = recs.map((r) => r.champ);
    expect(ids).not.toContain(TEEMO);
    expect(ids).not.toContain(DARIUS);
    expect(ids).not.toContain(LEE); // only 20 games < MIN_ROLE_GAMES
    expect(MIN_ROLE_GAMES).toBeGreaterThan(20);
    expect(ids).toEqual([MALPHITE, GAREN]);
  });

  it("off-lane enemies matter less than the lane opponent", () => {
    const lane = scoreCounters({ role: "TOP", enemies: [{ champ: DARIUS, role: "TOP" }], champRows, matchupRows });
    const offLane = scoreCounters({
      role: "TOP",
      enemies: [{ champ: DARIUS, role: null }],
      champRows,
      matchupRows,
    });
    const teemoLane = lane.find((r) => r.champ === TEEMO)!;
    const teemoOff = offLane.find((r) => r.champ === TEEMO)!;
    expect(teemoLane.score - teemoLane.baseWinRate).toBeGreaterThan(teemoOff.score - teemoOff.baseWinRate);
  });
});
