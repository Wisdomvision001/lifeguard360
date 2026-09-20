import { describe, expect, it } from "vitest";

import { PRESERVED_TAG_KEYS, suggestCategory } from "./categories.ts";

describe("suggestCategory", () => {
  it.each([
    [{ amenity: "hospital" }, "hospital"],
    [{ amenity: "clinic" }, "clinic"],
    [{ amenity: "pharmacy" }, "pharmacy"],
    [{ amenity: "doctors" }, "clinic"],
    [{ healthcare: "pharmacy" }, "pharmacy"],
    [{ healthcare: "clinic" }, "clinic"],
    [{ healthcare: "centre" }, "health-centre"],
  ])("maps %j → %s", (tags, expected) => {
    expect(suggestCategory(tags)).toBe(expected);
  });

  it("prefers the first rule when multiple could apply (amenity wins)", () => {
    expect(suggestCategory({ amenity: "hospital", healthcare: "clinic" })).toBe("hospital");
  });

  it("maps unknown healthcare values to unknown (no guessing)", () => {
    expect(suggestCategory({ healthcare: "laboratory" })).toBe("unknown");
    expect(suggestCategory({ healthcare: "midwife" })).toBe("unknown");
  });

  it("handles ambiguous combinations conservatively", () => {
    // amenity=doctors + healthcare=centre: doctors rule is precedence-first → clinic
    expect(suggestCategory({ amenity: "doctors", healthcare: "centre" })).toBe("clinic");
  });

  it("returns unknown for missing, empty, or unrelated tags", () => {
    expect(suggestCategory({})).toBe("unknown");
    expect(suggestCategory(null)).toBe("unknown");
    expect(suggestCategory(undefined)).toBe("unknown");
    expect(suggestCategory({ shop: "supermarket" })).toBe("unknown");
    expect(suggestCategory({ amenity: "" })).toBe("unknown");
  });

  it("is case-insensitive on tag values", () => {
    expect(suggestCategory({ amenity: "Hospital" })).toBe("hospital");
    expect(suggestCategory({ healthcare: "Centre" })).toBe("health-centre");
  });
});

describe("PRESERVED_TAG_KEYS", () => {
  it("covers every audited key that must survive parsing verbatim", () => {
    for (const key of [
      "amenity",
      "healthcare",
      "emergency",
      "operator",
      "phone",
      "contact:phone",
      "opening_hours",
    ]) {
      expect(PRESERVED_TAG_KEYS).toContain(key);
    }
  });
});
