import { describe, expect, it } from "vitest";
import { parseSession } from "./session";

const session = {
  localPlayerCellId: 2,
  myTeam: [
    { cellId: 0, championId: 266, assignedPosition: "top" },
    { cellId: 1, championId: 0, championPickIntent: 64, assignedPosition: "jungle" },
    { cellId: 2, championId: 103, assignedPosition: "middle", spell1Id: 4, spell2Id: 14 },
    { cellId: 3, championId: 0, assignedPosition: "bottom" },
    { cellId: 4, championId: 0, assignedPosition: "utility" },
  ],
  theirTeam: [
    { cellId: 5, championId: 122, assignedPosition: "" },
    { cellId: 6, championId: 0, assignedPosition: "" },
  ],
  actions: [
    [
      { type: "ban", completed: true, championId: 157 },
      { type: "ban", completed: false, championId: 238 },
    ],
    [{ type: "pick", completed: true, championId: 266 }],
  ],
  bans: { myTeamBans: [55], theirTeamBans: [] },
};

describe("parseSession", () => {
  it("returns null for invalid data", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({})).toBeNull();
    expect(parseSession("x")).toBeNull();
  });

  it("finds the local player's role", () => {
    expect(parseSession(session)?.localRole).toBe("MIDDLE");
  });

  it("uses pick intent when nothing is locked", () => {
    const view = parseSession(session)!;
    expect(view.myTeam[1].champ).toBe(64);
    expect(view.myTeam[2].isLocal).toBe(true);
  });

  it("reads enemy champions with unknown roles", () => {
    expect(parseSession(session)!.enemies).toEqual([
      { champ: 122, role: null },
      { champ: 0, role: null },
    ]);
  });

  it("lists completed bans and taken champions as unavailable", () => {
    const unavailable = parseSession(session)!.unavailable;
    expect(unavailable).toEqual(expect.arrayContaining([157, 55, 266, 64, 122]));
    expect(unavailable).not.toContain(238);
    expect(unavailable).not.toContain(0);
  });
});

describe("parseSession local player", () => {
  it("exposes the local champion and spells", () => {
    const view = parseSession(session)!;
    expect(view.localChamp).toBe(103);
    expect(view.localSpells).toEqual([4, 14]);
    expect(view.unavailable).not.toContain(103);
  });
});
