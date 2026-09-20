import { describe, expect, it } from "vitest";

import { composeAddressCandidate, extractAddressRaw, ADDRESS_COMPONENT_ORDER } from "./address.ts";

const COMPLETE = {
  "addr:housenumber": "12",
  "addr:street": "Abuja Road",
  "addr:suburb": "Yola North",
  "addr:city": "Yola",
  "addr:state": "Adamawa State",
  "addr:postcode": "640001",
  "addr:country": "Nigeria",
};

describe("composeAddressCandidate", () => {
  it("composes a complete address most-specific-first", () => {
    expect(composeAddressCandidate(COMPLETE)).toBe(
      "12, Abuja Road, Yola North, Yola, Adamawa State, 640001, Nigeria",
    );
  });

  it("matches the approved example (street, city, state, country)", () => {
    expect(
      composeAddressCandidate({
        "addr:street": "Abuja Road",
        "addr:city": "Yola",
        "addr:state": "Adamawa State",
        "addr:country": "Nigeria",
      }),
    ).toBe("Abuja Road, Yola, Adamawa State, Nigeria");
  });

  it("handles a partial address by skipping absent components", () => {
    expect(
      composeAddressCandidate({ "addr:street": "Abuja Road", "addr:city": "Yola" }),
    ).toBe("Abuja Road, Yola");
  });

  it("handles only-city and only-street cases", () => {
    expect(composeAddressCandidate({ "addr:city": "Yola" })).toBe("Yola");
    expect(composeAddressCandidate({ "addr:street": "Abuja Road" })).toBe("Abuja Road");
  });

  it("treats empty and whitespace-only values as absent", () => {
    expect(composeAddressCandidate({ "addr:city": "   ", "addr:street": "" })).toBeNull();
    expect(
      composeAddressCandidate({ "addr:city": "Yola", "addr:street": "   " }),
    ).toBe("Yola");
  });

  it("returns null when no addr:* tags exist", () => {
    expect(composeAddressCandidate({ amenity: "hospital" })).toBeNull();
    expect(composeAddressCandidate({})).toBeNull();
    expect(composeAddressCandidate(null)).toBeNull();
    expect(composeAddressCandidate(undefined)).toBeNull();
  });

  it("trims values for joining without altering content", () => {
    expect(composeAddressCandidate({ "addr:city": "  Yola  " })).toBe("Yola");
  });

  it("is deterministic regardless of input key order", () => {
    const a = composeAddressCandidate({ "addr:city": "Yola", "addr:street": "Abuja Road" });
    const b = composeAddressCandidate({ "addr:street": "Abuja Road", "addr:city": "Yola" });
    expect(a).toBe(b);
  });
});

describe("extractAddressRaw", () => {
  it("returns verbatim addr:* tags only", () => {
    const tags = { ...COMPLETE, amenity: "hospital", name: "X" };
    const raw = extractAddressRaw(tags);
    expect(raw).toEqual(COMPLETE);
    expect(raw).not.toHaveProperty("amenity");
  });

  it("returns null when there are no address tags", () => {
    expect(extractAddressRaw({ amenity: "clinic" })).toBeNull();
    expect(extractAddressRaw(null)).toBeNull();
  });

  it("ignores non-string addr values", () => {
    expect(extractAddressRaw({ "addr:city": 42 })).toBeNull();
  });
});

describe("ADDRESS_COMPONENT_ORDER", () => {
  it("follows the approved most-specific-first order", () => {
    expect(ADDRESS_COMPONENT_ORDER).toEqual([
      "addr:housenumber",
      "addr:street",
      "addr:suburb",
      "addr:city",
      "addr:state",
      "addr:postcode",
      "addr:country",
    ]);
  });
});
