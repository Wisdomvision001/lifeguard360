import { describe, expect, it } from "vitest";

import { FIRST_AID_GUIDES } from "@/data/firstAid";
import {
  isDirty,
  isDraftValid,
  toDraft,
  validateDraft,
} from "@/pages/admin/guideEditorDraft";

const burns = FIRST_AID_GUIDES.burns;

describe("guideEditorDraft — draft model", () => {
  it("maps the bundled guide into an editable draft without losing fields", () => {
    const draft = toDraft(burns);
    expect(draft.label).toBe("Burns");
    expect(draft.summary).toBe(burns.summary);
    expect(draft.contentVersion).toBe("0.1.0-unreviewed");
    expect(draft.steps).toHaveLength(burns.content.steps.length);
    // Step media is preserved: the burns "Cool the burn" step has a real image.
    const coolStep = draft.steps[1];
    expect(coolStep.image).toBe("/images/first-aid/burns/burns-cool-running-water.jpg");
    expect(coolStep.imageAlt.length).toBeGreaterThan(0);
    // Steps without media stay honestly empty, never fabricated.
    expect(draft.steps[0].image).toBe("");
    expect(draft.steps[0].imageAlt).toBe("");
    expect(draft.quickGuide.immediatePriority).toBe(
      burns.content.quickGuide.immediatePriority,
    );
    expect(draft.dos).toEqual(burns.content.dos);
    expect(draft.donts).toEqual(burns.content.donts);
    expect(draft.whenToSeekHelp).toEqual(burns.content.whenToSeekHelp);
  });

  it("reports dirty only after a real change", () => {
    const draft = toDraft(burns);
    expect(isDirty(draft, burns)).toBe(false);
    const changed = { ...draft, label: "Burns and scalds" };
    expect(isDirty(changed, burns)).toBe(true);
    // Reverting restores cleanliness (JSON equality is the source of truth).
    const reverted = { ...changed, label: "Burns" };
    expect(isDirty(reverted, burns)).toBe(false);
  });
});

describe("guideEditorDraft — validation", () => {
  it("accepts the bundled content as valid", () => {
    const errors = validateDraft(toDraft(burns));
    expect(isDraftValid(errors)).toBe(true);
  });

  it("requires a label and caps its length", () => {
    const draft = toDraft(burns);
    expect(validateDraft({ ...draft, label: "  " }).label).toBeDefined();
    expect(validateDraft({ ...draft, label: "x".repeat(81) }).label).toBeDefined();
    expect(validateDraft({ ...draft, label: "x".repeat(80) }).label).toBeUndefined();
  });

  it("validates every step's title and text", () => {
    const draft = toDraft(burns);
    const brokenSteps = draft.steps.map((step, index) =>
      index === 2 ? { ...step, title: "   " } : step,
    );
    const errors = validateDraft({ ...draft, steps: brokenSteps });
    expect(errors.steps[2]?.title).toBeDefined();
    expect(isDraftValid(errors)).toBe(false);
  });

  it("flags empty list items and empty lists", () => {
    const draft = toDraft(burns);
    const withBlank = { ...draft, dos: draft.dos.map((item, i) => (i === 1 ? "  " : item)) };
    const blankErrors = validateDraft(withBlank);
    expect(blankErrors.dos.items[1]).toBeDefined();
    expect(blankErrors.dos.list).toBeUndefined();

    const emptyErrors = validateDraft({ ...draft, dos: [] });
    expect(emptyErrors.dos.list).toBe("Add at least one item.");
    expect(isDraftValid(emptyErrors)).toBe(false);
  });

  it("requires the quick guide priority", () => {
    const draft = toDraft(burns);
    const errors = validateDraft({
      ...draft,
      quickGuide: { ...draft.quickGuide, immediatePriority: "" },
    });
    expect(errors.quickGuidePriority).toBeDefined();
    expect(isDraftValid(errors)).toBe(false);
  });

  it("caps step media metadata lengths", () => {
    const draft = toDraft(burns);
    const longImage = draft.steps.map((step, i) =>
      i === 0 ? { ...step, image: `/${"x".repeat(512)}` } : step,
    );
    expect(validateDraft({ ...draft, steps: longImage }).steps[0]?.image).toBeDefined();
  });
});
