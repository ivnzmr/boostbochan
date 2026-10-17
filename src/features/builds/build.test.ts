import { describe, expect, it } from "vitest";
import type { Item } from "../../lib/ddragon";
import type { BuildRow } from "../../lib/stats";
import { bestKey, computeBuild, orderSpells, parseRunes, parseSkills, starterItems } from "./build";

const row = (kind: BuildRow["kind"], key: string, games: number, wins: number, bucket = 255): BuildRow => ({
  source: "soloq",
  role: "MIDDLE",
  champ: 103,
  kind,
  bucket,
  key,
  games,
  wins,
});

const item = (id: number, flags: Partial<Item> = {}): [number, Item] => [
  id,
  { id, name: `Item ${id}`, gold: 3000, completed: true, boots: false, image: "", ...flags },
];

const items = new Map<number, Item>([
  item(6655),
  item(3157),
  item(4645),
  item(3089),
  item(3135),
  item(3020, { boots: true, completed: false }),
  item(3111, { boots: true, completed: false }),
  item(1056, { completed: false }),
]);

describe("bestKey", () => {
  it("prefers the best win rate among popular options", () => {
    const best = bestKey([row("spell", "4,14", 100, 50), row("spell", "4,12", 40, 28), row("spell", "4,21", 5, 5)]);
    expect(best?.key).toBe("4,12"); // 5-game 100% option is below the popularity floor
  });

  it("merges rows with the same key across sources and buckets", () => {
    const best = bestKey([row("rune", "a", 10, 5), { ...row("rune", "a", 10, 5), source: "pro" }, row("rune", "b", 15, 6)]);
    expect(best).toMatchObject({ key: "a", games: 20 });
  });

  it("returns null without rows", () => {
    expect(bestKey([])).toBeNull();
  });
});

describe("parsers", () => {
  it("parses rune pages in LCU order", () => {
    expect(parseRunes("8100:8300:8112,8139,8138,8135:8304,8345:5008,5008,5001")).toEqual({
      primaryStyle: 8100,
      subStyle: 8300,
      perks: [8112, 8139, 8138, 8135, 8304, 8345, 5008, 5008, 5001],
    });
    expect(parseRunes("8100:8300:1,2:3")).toBeNull();
  });

  it("expands skill priority into 18 levels", () => {
    const order = parseSkills("QEW|QWE")!;
    expect(order.levels.slice(0, 7)).toEqual(["Q", "W", "E", "Q", "Q", "R", "Q"]);
    expect(order.levels.filter((s) => s === "Q")).toHaveLength(5);
    expect(order.levels.filter((s) => s === "R")).toHaveLength(3);
    expect(order.levels).toHaveLength(18);
    expect(parseSkills("bad")).toBeNull();
  });
});

describe("starterItems", () => {
  it("depends on role and damage type", () => {
    expect(starterItems("MIDDLE", true)).toEqual([1056, 2003]);
    expect(starterItems("TOP", false)[0]).toBe(1055);
    expect(starterItems("UTILITY", false)[0]).toBe(3865);
  });
});

describe("computeBuild", () => {
  const rows: BuildRow[] = [
    row("spell", "4,14", 100, 55),
    row("rune", "8100:8300:8112,8139,8138,8135:8304,8345:5008,5008,5001", 90, 50),
    row("skill", "QEW|QWE", 80, 45),
    row("core", "6655-3157-4645", 30, 18, 2), // vs AP teams
    row("core", "6655-4645-3089", 50, 26, 1), // vs AD teams
    row("item", "6655", 90, 50, 2),
    row("item", "3157", 40, 24, 2),
    row("item", "3135", 30, 17, 2),
    row("item", "3020", 70, 38, 2),
    row("item", "3111", 20, 10, 2),
    row("item", "1056", 50, 25, 2),
  ];

  it("adapts core items to the enemy damage profile", () => {
    const vsAp = computeBuild({ rows, role: "MIDDLE", bucket: 2, isAp: true, items });
    expect(vsAp.core?.value).toEqual([6655, 3157, 4645]);
    // Too few games vs mixed teams: falls back to all profiles (most winning popular core).
    const mixed = computeBuild({ rows, role: "MIDDLE", bucket: 0, isAp: true, items });
    expect(mixed.core?.value).toEqual([6655, 3157, 4645]);
  });

  it("fills every part of the build", () => {
    const build = computeBuild({ rows, role: "MIDDLE", bucket: 2, isAp: true, items });
    expect(build.games).toBe(100);
    expect(build.spells?.value).toEqual([4, 14]);
    expect(build.runes?.value.primaryStyle).toBe(8100);
    expect(build.skills?.value.priority).toBe("QEW");
    expect(build.boots?.value).toBe(3020);
    expect(build.starters).toEqual([1056, 2003]);
  });

  it("situational items exclude core, boots and components", () => {
    const build = computeBuild({ rows, role: "MIDDLE", bucket: 2, isAp: true, items });
    expect(build.situational.map((s) => s.item)).toEqual([3135]);
  });

  it("handles champions without data", () => {
    const build = computeBuild({ rows: [], role: "TOP", bucket: 1, isAp: false, items });
    expect(build).toMatchObject({ games: 0, runes: null, spells: null, core: null, boots: null, situational: [] });
  });
});

describe("orderSpells", () => {
  it("keeps Flash where the player has it", () => {
    expect(orderSpells([4, 14], [4, 7])).toEqual([4, 14]);
    expect(orderSpells([4, 14], [7, 4])).toEqual([14, 4]);
    expect(orderSpells([14, 4], [12, 7])).toEqual([14, 4]); // default Flash on F
  });

  it("keeps other spells in their current slot", () => {
    expect(orderSpells([11, 12], [12, 3])).toEqual([12, 11]);
    expect(orderSpells([11, 12], [11, 3])).toEqual([11, 12]);
  });
});
