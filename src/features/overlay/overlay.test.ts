import { describe, expect, it } from "vitest";
import type { Build } from "../builds/build";
import { nextItem, parseLiveData } from "./overlay";

const live = {
  activePlayer: { riotIdGameName: "Eve404", currentGold: 1234.5, level: 9 },
  allPlayers: [
    {
      riotIdGameName: "Eve404",
      rawChampionName: "game_character_displayname_Ahri",
      championName: "Ahri",
      position: "MIDDLE",
      team: "ORDER",
      items: [{ itemID: 6655 }, { itemID: 1056 }],
      scores: { kills: 3, deaths: 1, assists: 4, creepScore: 120 },
    },
    { riotIdGameName: "Rival", rawChampionName: "game_character_displayname_Zed", team: "CHAOS", scores: {} },
    { riotIdGameName: "Ally", rawChampionName: "game_character_displayname_LeeSin", team: "ORDER", scores: {} },
  ],
  gameData: { gameTime: 900 },
};

describe("parseLiveData", () => {
  it("extracts the active player and enemies", () => {
    expect(parseLiveData(live)).toEqual({
      championId: "Ahri",
      role: "MIDDLE",
      gold: 1234.5,
      level: 9,
      kills: 3,
      deaths: 1,
      assists: 4,
      cs: 120,
      gameMinutes: 15,
      items: [6655, 1056],
      enemyChampionIds: ["Zed"],
    });
  });

  it("returns null without a game", () => {
    expect(parseLiveData(null)).toBeNull();
    expect(parseLiveData({ activePlayer: {}, allPlayers: [] })).toBeNull();
  });
});

describe("nextItem", () => {
  const build: Build = {
    games: 10,
    runes: null,
    spells: null,
    skills: null,
    starters: [],
    core: { value: [6655, 3157, 4645], games: 5, winRate: 0.5 },
    boots: { value: 3020, games: 5, winRate: 0.5 },
    situational: [{ item: 3135, games: 3, winRate: 0.5, pickRate: 0.3 }],
  };

  it("follows core, then boots, then situational", () => {
    expect(nextItem(build, [6655])).toBe(3157);
    expect(nextItem(build, [6655, 3157, 4645])).toBe(3020);
    expect(nextItem(build, [6655, 3157, 4645, 3020])).toBe(3135);
    expect(nextItem(build, [6655, 3157, 4645, 3020, 3135])).toBeNull();
    expect(nextItem(null, [])).toBeNull();
  });
});
