import { describe, expect, it } from "vitest";

import { CONTENT_VERSION, FIRST_AID_GUIDES, GUIDE_LIST } from "@/data/firstAid";
import { EMERGENCY_CATEGORY_IDS } from "@/types";

describe("first-aid data architecture", () => {
  it("exposes all six categories", () => {
    expect(Object.keys(FIRST_AID_GUIDES).sort()).toEqual(
      [...EMERGENCY_CATEGORY_IDS].sort(),
    );
    expect(GUIDE_LIST).toHaveLength(EMERGENCY_CATEGORY_IDS.length);
  });

  it("keeps the content version unreviewed (no silent promotion)", () => {
    expect(CONTENT_VERSION).toBe("0.1.0-unreviewed");
    for (const guide of GUIDE_LIST) {
      expect(guide.content.contentVersion).toBe("0.1.0-unreviewed");
    }
  });

  it("gives every guide structured steps with a title and text", () => {
    for (const guide of GUIDE_LIST) {
      expect(guide.content.steps.length).toBeGreaterThan(0);
      for (const step of guide.content.steps) {
        expect(step.title.trim()).not.toBe("");
        expect(step.text.trim()).not.toBe("");
      }
    }
  });

  it("never fabricates step media (images/videos only when real assets exist)", () => {
    for (const guide of GUIDE_LIST) {
      for (const step of guide.content.steps) {
        if (step.image !== undefined) {
          expect(step.image.startsWith("/images/first-aid/")).toBe(true);
          // An instructional visual is useless without meaningful alt text.
          expect(step.imageAlt).toBeDefined();
          expect(step.imageAlt!.length).toBeGreaterThan(30);
        } else {
          expect(step.imageAlt).toBeUndefined();
        }
      }
      expect(guide.content.video).toBeUndefined();
      expect(guide.content.variants).toBeUndefined();
    }
  });

  it("attaches first-batch visuals to exactly the intended steps", () => {
    const expected = [
      { category: "burns", stepTitle: "Cool the burn", file: "burns/burns-cool-running-water.jpg" },
      { category: "choking", stepTitle: "Back blows", file: "choking/choking-back-blows.jpg" },
      { category: "choking", stepTitle: "Abdominal thrusts", file: "choking/choking-abdominal-thrusts.jpg" },
      { category: "bleeding", stepTitle: "Bandage", file: "bleeding/bleeding-bandage.jpg" },
    ] as const;
    for (const { category, stepTitle, file } of expected) {
      const guide = FIRST_AID_GUIDES[category];
      const step = guide.content.steps.find((s) => s.title === stepTitle);
      expect(step, `${category} › ${stepTitle}`).toBeDefined();
      expect(step?.image).toBe(`/images/first-aid/${file}`);
    }
  });

  it("gives every guide a complete quick guide structure", () => {
    for (const guide of GUIDE_LIST) {
      const qg = guide.content.quickGuide;
      expect(qg.immediatePriority.trim()).not.toBe("");
      expect(Array.isArray(qg.essentialActions)).toBe(true);
      expect(qg.essentialActions.length).toBeGreaterThan(0);
      expect(Array.isArray(qg.criticalDonts)).toBe(true);
      expect(qg.criticalDonts.length).toBeGreaterThan(0);
    }
  });

  it("keeps the quick guide consistent with the canonical donts", () => {
    // Canonical-protocol principle: the quick guide is a compression of the
    // same protocol, so every critical don't must be traceable to a canonical
    // don't (compressed wording may shorten, but no new topic may appear).
    const STOPWORDS = new Set([
      "do", "not", "the", "a", "an", "any", "or", "and", "to", "in",
      "on", "of", "if", "is", "be", "with", "for", "more", "into",
    ]);
    const words = (s: string): string[] =>
      s
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

    for (const guide of GUIDE_LIST) {
      const canonical = words(guide.content.donts.join(" "));
      for (const dont of guide.content.quickGuide.criticalDonts) {
        const criticalWords = words(dont);
        expect(criticalWords.length).toBeGreaterThan(0);
        const overlaps = criticalWords.filter((w) => canonical.includes(w));
        expect(
          overlaps.length,
          `"${dont}" has no traceable canonical don't in ${guide.id}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("retains provenance marking content as pending review", () => {
    for (const guide of GUIDE_LIST) {
      expect(guide.content.provenance.length).toBeGreaterThan(0);
      expect(JSON.stringify(guide.content.provenance)).toContain("pending");
    }
  });
});
