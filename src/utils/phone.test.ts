import { describe, expect, it } from "vitest";

import { toE164Nigerian, isValidE164Nigerian } from "@/utils/phone";

describe("toE164Nigerian", () => {
  it("normalises local 0-prefixed numbers", () => {
    expect(toE164Nigerian("08012345678")).toBe("+2348012345678");
  });

  it("normalises spaced and dashed formats", () => {
    expect(toE164Nigerian("0801 234 5678")).toBe("+2348012345678");
    expect(toE164Nigerian("+234-801-234-5678")).toBe("+2348012345678");
  });

  it("normalises 234-prefixed numbers without the plus", () => {
    expect(toE164Nigerian("2348012345678")).toBe("+2348012345678");
  });

  it("accepts already-valid E.164", () => {
    expect(toE164Nigerian("+2348012345678")).toBe("+2348012345678");
  });

  it("rejects numbers with the wrong digit count", () => {
    expect(toE164Nigerian("0801234567")).toBeNull();
    expect(toE164Nigerian("080123456789")).toBeNull();
  });

  it("rejects numbers that do not start with 7/8/9 after the prefix", () => {
    expect(toE164Nigerian("01234567890")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(toE164Nigerian("abc")).toBeNull();
    expect(toE164Nigerian("")).toBeNull();
  });
});

describe("isValidE164Nigerian", () => {
  it("accepts canonical E.164 only", () => {
    expect(isValidE164Nigerian("+2348012345678")).toBe(true);
    expect(isValidE164Nigerian("08012345678")).toBe(false);
    expect(isValidE164Nigerian("+23480123456789")).toBe(false);
  });
});
