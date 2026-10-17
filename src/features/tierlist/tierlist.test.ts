import { describe, expect, it } from "vitest";
import type { ChampRow } from "../../lib/stats";
import { buildTierList, tierForRank } from "./tierlist";

describe("tierForRank", () => {
  it("splits ranks into tiers by percentile", () => {
    expect(tierForRank(0, 20)).toBe("S+");
    expect(tierForRank(3, 20)).toBe("S");
    expect(tierForRank(8, 20)).toBe("A");
    expect(tierForRank(14, 20)).toBe("B");
    expect(tierForRank(19, 20)).toBe("C");
  });
});

describe("buildTierList", () => {
  const rows: ChampRow[] = [
    { source: "soloq", role: "MIDDLE", champ: 1, games: 500, wins: 280 },
    { source: "soloq", role: "MIDDLE", champ: 2, games: 500, wins: 240 },
    { source: "soloq", role: "MIDDLE", champ: 3, games: 4, wins: 4 }, // pick rate 0.4%
    { source: "soloq", role: "MIDDLE", champ: 4, games: 100, wins: 50 },
    { source: "pro", role: "MIDDLE", champ: 4, games: 40, wins: 30 },
    { source: "soloq", role: "TOP", champ: 9, games: 500, wins: 300 },
  ];

  it("ranks by shrunk win rate within the role", () => {
    const list = buildTierList(rows, "MIDDLE", 1000);
    expect(list.map((e) => e.champ)).toEqual([4, 1, 2]); // pro games (×3) lift champ 4
    expect(list[1]).toMatchObject({ games: 500, winRate: 0.56, pickRate: 0.5 });
    expect(list.map((e) => e.tier)).toEqual(["A", "B", "C"]); // percentiles of a 3-champ list
    expect(list[0].proGames).toBe(40);
  });

  it("drops champions below the minimum pick rate", () => {
    expect(buildTierList(rows, "MIDDLE", 1000).map((e) => e.champ)).not.toContain(3);
  });

  it("returns nothing without data", () => {
    expect(buildTierList(rows, "MIDDLE", 0)).toEqual([]);
    expect(buildTierList([], "JUNGLE", 100)).toEqual([]);
  });
});
