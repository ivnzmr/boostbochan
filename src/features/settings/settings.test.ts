import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, FEATURES, MAX_ACCEPT_DELAY_SEC, mergeSettings } from "./settings";

describe("mergeSettings", () => {
  it("returns defaults for missing or invalid input", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid stored values", () => {
    const merged = mergeSettings({ autoAccept: false, overlay: true, autoAcceptDelaySec: 5 });
    expect(merged.autoAccept).toBe(false);
    expect(merged.overlay).toBe(true);
    expect(merged.autoAcceptDelaySec).toBe(5);
  });

  it("ignores values with the wrong type", () => {
    const merged = mergeSettings({ autoAccept: "yes", autoAcceptDelaySec: "3" });
    expect(merged.autoAccept).toBe(DEFAULT_SETTINGS.autoAccept);
    expect(merged.autoAcceptDelaySec).toBe(DEFAULT_SETTINGS.autoAcceptDelaySec);
  });

  it("clamps and rounds the accept delay", () => {
    expect(mergeSettings({ autoAcceptDelaySec: 99 }).autoAcceptDelaySec).toBe(MAX_ACCEPT_DELAY_SEC);
    expect(mergeSettings({ autoAcceptDelaySec: -4 }).autoAcceptDelaySec).toBe(0);
    expect(mergeSettings({ autoAcceptDelaySec: 2.6 }).autoAcceptDelaySec).toBe(3);
    expect(mergeSettings({ autoAcceptDelaySec: Number.NaN }).autoAcceptDelaySec).toBe(
      DEFAULT_SETTINGS.autoAcceptDelaySec,
    );
  });

  it("drops unknown keys", () => {
    expect(mergeSettings({ hack: true })).not.toHaveProperty("hack");
  });

  it("does not mutate the defaults", () => {
    const merged = mergeSettings({ autoAccept: false });
    expect(merged).not.toBe(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.autoAccept).toBe(true);
  });
});

describe("FEATURES", () => {
  it("has one entry per boolean setting", () => {
    const booleanKeys = Object.entries(DEFAULT_SETTINGS)
      .filter(([, value]) => typeof value === "boolean")
      .map(([key]) => key)
      .sort();
    expect(FEATURES.map((f) => f.key).sort()).toEqual(booleanKeys);
  });
});
