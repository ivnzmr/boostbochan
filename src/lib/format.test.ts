import { describe, expect, it } from "vitest";
import { pct, relativeTime, winRateTone } from "./format";

describe("format", () => {
  it("formats percentages", () => {
    expect(pct(0.5234)).toBe("52.3%");
  });

  it("colors win rates", () => {
    expect(winRateTone(0.55)).toBe("text-ok");
    expect(winRateTone(0.45)).toBe("text-bad");
    expect(winRateTone(0.5)).toBe("text-text");
  });

  it("formats relative times in Spanish", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("hace 3 horas");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("anteayer");
    expect(relativeTime(now - 10_000, now)).toBe("este minuto");
  });
});
