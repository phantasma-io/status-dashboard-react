import { describe, expect, it } from "vitest";
import {
  computeDelta,
  formatMilliseconds,
  formatSeconds,
  getDeltaTone,
} from "@/lib/metrics";

describe("metrics", () => {
  it("returns null delta when max height is unknown", () => {
    // Unknown max height should keep delta neutral.
    expect(computeDelta(10, null)).toBeNull();
  });

  it("computes non-negative deltas", () => {
    // Negative gaps should clamp to zero to avoid confusing negative deltas.
    expect(computeDelta(15, 10)).toBe(0);
    expect(computeDelta(10, 25)).toBe(15);
  });

  it("classifies delta tone based on thresholds", () => {
    // Coloring rules: <=10 is warning, >10 is danger, null is neutral.
    expect(getDeltaTone(null)).toBe("neutral");
    expect(getDeltaTone(10)).toBe("warning");
    expect(getDeltaTone(11)).toBe("danger");
  });

  it("formats durations into compact units", () => {
    // Large delays should collapse into higher-level units for readability.
    expect(formatSeconds(59)).toBe("59s");
    expect(formatSeconds(90)).toBe("1.5m");
    expect(formatSeconds(3600)).toBe("1.0h");
    expect(formatSeconds(90000)).toBe("1.0d");
    expect(formatSeconds(900000)).toBe("1.5w");
  });

  it("formats millisecond delays using the same compact units", () => {
    // Millisecond inputs should map to the same unit logic.
    expect(formatMilliseconds(1500)).toBe("1.5s");
    expect(formatMilliseconds(60000)).toBe("1.0m");
  });
});
