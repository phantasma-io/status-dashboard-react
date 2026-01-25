import { describe, expect, it } from "vitest";
import { readNumber } from "@/lib/validators";

describe("readNumber", () => {
  it("accepts finite numbers and numeric strings", () => {
    // Numeric strings from APIs should parse into numbers.
    expect(readNumber(42)).toBe(42);
    expect(readNumber("42")).toBe(42);
    expect(readNumber("  7.5 ")).toBe(7.5);
  });

  it("rejects non-numeric values", () => {
    // Non-numeric inputs must return null to avoid false positives.
    expect(readNumber("abc")).toBeNull();
    expect(readNumber("12px")).toBeNull();
    expect(readNumber(null)).toBeNull();
  });
});
