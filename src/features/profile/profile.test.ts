import { describe, expect, it } from "vitest";
import { championSummaries, parseHistory, parseRanked, roleFromTimeline } from "./profile";

const game = (gameId: number, champ: number, win: boolean, duration = 1800, lane = "MIDDLE", role = "SOLO") => ({
  gameId,
  gameCreation: gameId * 1000,
  gameDuration: duration,
  queueId: 420,
  participants: [
    {
      championId: champ,
      spell1Id: 4,
      spell2Id: 14,
      timeline: { lane, role },
      stats: {
        win,
        kills: 5,
        deaths: 2,
        assists: 7,
        totalMinionsKilled: 200,
        neutralMinionsKilled: 10,
        goldEarned: 12000,
        visionScore: 20,
        totalDamageDealtToChampions: 25000,
        item0: 3089,
        item6: 3340,
      },
    },
  ],
});

describe("parseRanked", () => {
  it("keeps solo and flex queues", () => {
    const queues = parseRanked({
      queues: [
        { queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "II", leaguePoints: 45, wins: 30, losses: 25 },
        { queueType: "RANKED_TFT", tier: "SILVER" },
      ],
    });
    expect(queues).toEqual([
      { queueType: "RANKED_SOLO_5x5", tier: "GOLD", division: "II", leaguePoints: 45, wins: 30, losses: 25 },
    ]);
    expect(parseRanked(null)).toEqual([]);
  });
});

describe("roleFromTimeline", () => {
  it("maps legacy lanes", () => {
    expect(roleFromTimeline("BOTTOM", "DUO_SUPPORT")).toBe("UTILITY");
    expect(roleFromTimeline("BOTTOM", "DUO_CARRY")).toBe("BOTTOM");
    expect(roleFromTimeline("MID", "SOLO")).toBe("MIDDLE");
    expect(roleFromTimeline("NONE", "NONE")).toBeNull();
  });
});

describe("parseHistory", () => {
  it("parses newest first with derived stats", () => {
    const history = parseHistory({ games: { games: [game(1, 103, true), game(2, 7, false)] } });
    expect(history.map((m) => m.gameId)).toEqual([2, 1]);
    expect(history[1]).toMatchObject({ champ: 103, win: true, cs: 210, minutes: 30, role: "MIDDLE", remake: false });
    expect(history[1].items[0]).toBe(3089);
  });

  it("flags remakes and tolerates bad data", () => {
    expect(parseHistory({ games: { games: [game(3, 1, false, 200)] } })[0].remake).toBe(true);
    expect(parseHistory({})).toEqual([]);
  });
});

describe("championSummaries", () => {
  it("aggregates by champion without remakes", () => {
    const history = parseHistory({
      games: { games: [game(1, 103, true), game(2, 103, false), game(3, 7, true), game(4, 7, false, 120)] },
    });
    expect(championSummaries(history)).toEqual([
      { champ: 103, games: 2, wins: 1, kda: 6 },
      { champ: 7, games: 1, wins: 1, kda: 6 },
    ]);
  });
});
