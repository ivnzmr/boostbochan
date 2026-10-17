import { describe, expect, it } from "vitest";
import { shouldAccept } from "./autoAccept";

describe("shouldAccept", () => {
  it("accepts an open ready check with no response", () => {
    expect(shouldAccept({ state: "InProgress", playerResponse: "None" })).toBe(true);
  });

  it("does not accept after the player already answered", () => {
    expect(shouldAccept({ state: "InProgress", playerResponse: "Accepted" })).toBe(false);
    expect(shouldAccept({ state: "InProgress", playerResponse: "Declined" })).toBe(false);
  });

  it("does not accept when the ready check is not in progress", () => {
    expect(shouldAccept({ state: "Invalid", playerResponse: "None" })).toBe(false);
    expect(shouldAccept({ state: "EveryoneReady", playerResponse: "None" })).toBe(false);
  });

  it("handles missing or malformed data", () => {
    expect(shouldAccept(null)).toBe(false);
    expect(shouldAccept(undefined)).toBe(false);
    expect(shouldAccept({})).toBe(false);
    expect(shouldAccept({ state: 1, playerResponse: "None" })).toBe(false);
  });
});
