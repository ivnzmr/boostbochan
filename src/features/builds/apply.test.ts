import { describe, expect, it } from "vitest";
import type { Build } from "./build";
import { enemyBucket, itemSetDocument, runePagePayload } from "./apply";

const build: Build = {
  games: 100,
  runes: null,
  spells: null,
  skills: null,
  starters: [1056, 2003],
  core: { value: [6655, 3157, 4645], games: 50, winRate: 0.55 },
  boots: { value: 3020, games: 60, winRate: 0.52 },
  situational: [{ item: 3135, games: 30, winRate: 0.56, pickRate: 0.3 }],
};

describe("enemyBucket", () => {
  it("profiles the enemy team like the pipeline", () => {
    expect(enemyBucket([true, true, true, false, false])).toBe(2);
    expect(enemyBucket([true, false, false, false, false])).toBe(1);
    expect(enemyBucket([true, true, false, false, false])).toBe(0);
    expect(enemyBucket([])).toBe(1);
  });
});

describe("runePagePayload", () => {
  it("builds an LCU rune page", () => {
    const payload = runePagePayload({ primaryStyle: 8100, subStyle: 8300, perks: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, "Ahri");
    expect(payload).toEqual({
      name: "BoostBochan: Ahri",
      primaryStyleId: 8100,
      subStyleId: 8300,
      selectedPerkIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      current: true,
    });
  });
});

describe("itemSetDocument", () => {
  const current = {
    accountId: 1,
    timestamp: 0,
    itemSets: [{ uid: "mine", title: "Mi set" }, { uid: "boostbochan-103", title: "viejo" }],
  };

  it("replaces our set and keeps the player's sets", () => {
    const doc = itemSetDocument(current, 103, "Ahri", build, 2, 42);
    expect(doc.timestamp).toBe(42);
    expect(doc.itemSets.map((s) => s.uid)).toEqual(["mine", "boostbochan-103"]);
    const set = doc.itemSets[1] as unknown as { blocks: { type: string; items: { id: string }[] }[]; associatedChampions: number[] };
    expect(set.associatedChampions).toEqual([103]);
    expect(set.blocks.map((b) => b.type)).toEqual([
      "Inicio",
      "Core (55% victorias)",
      "Botas",
      "Situacional vs equipo AP",
    ]);
    expect(set.blocks[1].items.map((i) => i.id)).toEqual(["6655", "3157", "4645"]);
  });

  it("does not mutate the current document", () => {
    itemSetDocument(current, 103, "Ahri", build, 2);
    expect(current.itemSets).toHaveLength(2);
    expect(current.itemSets[1].title).toBe("viejo");
  });

  it("skips empty blocks", () => {
    const doc = itemSetDocument(current, 7, "LeBlanc", { ...build, core: null, boots: null, situational: [] }, 1);
    const set = doc.itemSets[doc.itemSets.length - 1] as unknown as { blocks: unknown[] };
    expect(set.blocks).toHaveLength(1);
  });
});
