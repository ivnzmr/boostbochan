import { describe, expect, it } from "vitest";
import { phaseLabel, profileIconUrl } from "./gameflow";
import { errorMessage } from "./errors";

describe("phaseLabel", () => {
  it("translates known phases", () => {
    expect(phaseLabel("ChampSelect")).toBe("Selección de campeón");
    expect(phaseLabel("InProgress")).toBe("En partida");
  });

  it("falls back to the raw phase or a dash", () => {
    expect(phaseLabel("SomethingNew")).toBe("SomethingNew");
    expect(phaseLabel(null)).toBe("—");
  });
});

describe("profileIconUrl", () => {
  it("builds a CommunityDragon url", () => {
    expect(profileIconUrl(29)).toMatch(/profile-icons\/29\.jpg$/);
  });
});

describe("errorMessage", () => {
  it("handles errors, strings and unknowns", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("lcu down")).toBe("lcu down");
    expect(errorMessage(42)).toBe("Error inesperado");
  });
});
