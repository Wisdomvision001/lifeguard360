import { describe, expect, it } from "vitest";

import { FIRST_AID_GUIDES } from "@/data/firstAid";
import {
  guideDocToGuide,
  guideToDoc,
  validateGuideForWrite,
} from "@/services/firstAid/guideContentCodec";

const STORAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/lifeguard360.appspot.com/o/images%2Fburns%2Fabc.png?alt=media&token=11111111-2222-3333-4444-555555555555";

describe("guideContentCodec — write side", () => {
  it("serialises a bundled guide into the exact document body the rules accept", () => {
    const doc = guideToDoc(FIRST_AID_GUIDES.burns);
    expect(doc.id).toBe("burns");
    expect(doc.label).toBe("Burns");
    expect(doc.provenance).toEqual(FIRST_AID_GUIDES.burns.content.provenance);
    // Timestamps are never chosen by the client — they are absent here.
    expect(Object.keys(doc)).not.toContain("publishedAt");
    expect(Object.keys(doc)).not.toContain("updatedAt");
  });

  it("round-trips every bundled guide through write → read unchanged", () => {
    for (const guide of Object.values(FIRST_AID_GUIDES)) {
      const doc = guideToDoc(guide);
      expect(guideDocToGuide(doc.id, doc)).toEqual(guide);
    }
  });

  it("accepts a guide for write when the model fits", () => {
    expect(validateGuideForWrite(FIRST_AID_GUIDES.choking)).toBeNull();
  });

  it("refuses to serialise a guide the codec would refuse to read", () => {
    const broken = {
      ...FIRST_AID_GUIDES.burns,
      label: "",
    };
    expect(validateGuideForWrite(broken)).toMatch(/does not fit/i);
  });
});

describe("guideContentCodec — read side", () => {
  it("accepts a Storage download URL on the guide and step image", () => {
    const base = guideToDoc(FIRST_AID_GUIDES.burns);
    const doc = {
      ...base,
      image: STORAGE_URL,
      content: {
        ...base.content,
        steps: base.content.steps.map((step, index) =>
          index === 1 ? { ...step, image: STORAGE_URL } : step,
        ),
      },
    };
    const guide = guideDocToGuide("burns", doc);
    expect(guide).not.toBeNull();
    expect(guide?.image).toBe(STORAGE_URL);
    expect(guide?.content.steps[1].image).toBe(STORAGE_URL);
  });

  it("reads a draft document (updatedAt instead of publishedAt) identically", () => {
    const body = guideToDoc(FIRST_AID_GUIDES.bleeding);
    const draftDoc = { ...body, updatedAt: "2026-10-02T10:00:00.000Z" };
    expect(guideDocToGuide("bleeding", draftDoc)).toEqual(FIRST_AID_GUIDES.bleeding);
  });

  it("rejects a document whose id does not match its path", () => {
    const doc = guideToDoc(FIRST_AID_GUIDES.burns);
    expect(guideDocToGuide("choking", doc)).toBeNull();
  });

  it("rejects an unknown category id", () => {
    expect(guideDocToGuide("not-a-category", guideToDoc(FIRST_AID_GUIDES.burns))).toBeNull();
  });

  it("rejects malformed content instead of serving it", () => {
    const base = guideToDoc(FIRST_AID_GUIDES.burns);

    // Unknown content key (schema stays closed).
    expect(
      guideDocToGuide("burns", {
        ...base,
        content: { ...base.content, flaggedPhrases: [] },
      }),
    ).toBeNull();

    // Empty steps — not publishable.
    expect(
      guideDocToGuide("burns", { ...base, content: { ...base.content, steps: [] } }),
    ).toBeNull();

    // Step missing its instruction text.
    expect(
      guideDocToGuide("burns", {
        ...base,
        content: { ...base.content, steps: [{ title: "Press" }] },
      }),
    ).toBeNull();

    // Legacy step shape with unknown keys.
    expect(
      guideDocToGuide("burns", {
        ...base,
        content: {
          ...base.content,
          steps: [{ number: 1, title: "Press", text: "Apply pressure.", flaggedPhrases: [] }],
        },
      }),
    ).toBeNull();

    // Over-long image reference (beyond the 512 bound).
    expect(
      guideDocToGuide("burns", { ...base, image: "x".repeat(513) }),
    ).toBeNull();

    // Non-array dos.
    expect(
      guideDocToGuide("burns", { ...base, content: { ...base.content, dos: "just one" } }),
    ).toBeNull();

    // Wrong quick guide shape.
    expect(
      guideDocToGuide("burns", {
        ...base,
        content: {
          ...base.content,
          quickGuide: { steps: ["press"] },
        },
      }),
    ).toBeNull();
  });
});
