import { describe, expect, it } from "vitest";

import {
  buildQuickGuide,
  getGuide,
  getStep,
  getSteps,
  guideToSpeechText,
  stepToSpeechText,
} from "@/services/firstAid/firstAidService";

describe("firstAidService — structured steps", () => {
  it("getStep returns canonical steps by 1-based number", () => {
    const guide = getGuide("burns");
    if (guide === null) throw new Error("burns guide missing");

    const first = getStep(guide, 1);
    expect(first).not.toBeNull();
    expect(first?.title).toBe("Stop the burning");
    expect(first?.text).toContain("heat source");

    expect(getStep(guide, 0)).toBeNull();
    expect(getStep(guide, 999)).toBeNull();
  });

  it("getSteps returns the full canonical sequence", () => {
    const guide = getGuide("choking");
    if (guide === null) throw new Error("choking guide missing");
    expect(getSteps(guide)).toEqual(guide.content.steps);
    expect(getSteps(guide).length).toBe(5);
  });

  it("stepToSpeechText reads title + text without object artifacts", () => {
    const guide = getGuide("bleeding");
    if (guide === null) throw new Error("bleeding guide missing");
    const step = getStep(guide, 1);
    if (step === null) throw new Error("step 1 missing");

    const spoken = stepToSpeechText(step, 1);
    expect(spoken).toContain("Step 1.");
    expect(spoken).toContain(step.title);
    expect(spoken).toContain(step.text);
    expect(spoken).not.toContain("[object Object]");
  });

  it("guideToSpeechText reads structured step text (no [object Object])", () => {
    const guide = getGuide("fractures");
    if (guide === null) throw new Error("fractures guide missing");

    const text = guideToSpeechText(guide);
    expect(text).toContain("Step 1. Keep still & support.");
    expect(text).not.toContain("[object Object]");
    expect(text).toContain("Do not:");
    expect(text).toContain("Seek professional help if:");
  });
});

describe("firstAidService — quick guide", () => {
  it("returns the explicitly stored quick guide (no runtime summarisation)", () => {
    const guide = getGuide("snake-bite");
    if (guide === null) throw new Error("snake-bite guide missing");

    const qg = buildQuickGuide(guide);
    expect(qg).toBe(guide.content.quickGuide);
    expect(qg.immediatePriority).toContain("calm and still");
    expect(qg.essentialActions.length).toBeGreaterThan(0);
    expect(qg.criticalDonts.length).toBeGreaterThan(0);
  });
});
