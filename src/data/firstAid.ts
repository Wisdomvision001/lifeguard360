import type { EmergencyCategoryId, FirstAidGuide, GuideProvenance } from "@/types";

/**
 * Static first-aid content for the six core categories.
 *
 * PROVENANCE & REVIEW STATUS (AD-15):
 * - Medical wording is the prototype content, pending review against a
 *   verified first-aid source (St John Ambulance / WHO / Nigerian Red Cross).
 * - Nothing here is presented as clinically approved until `reviewedBy` and
 *   `provenance` are populated by the review process.
 */

const UNREVIEWED_PROVENANCE: GuideProvenance[] = [
  {
    claim: "All instructions in this guide",
    source: "Prototype content — pending verified first-aid source review",
    verifiedAt: "",
  },
];

function makeGuide(
  id: EmergencyCategoryId,
  label: string,
  summary: string,
  steps: string[],
  dos: string[],
  donts: string[],
  whenToSeekHelp: string[],
): FirstAidGuide {
  return {
    id,
    label,
    summary,
    iconClass: `icon-${id}`,
    content: {
      contentVersion: "0.1.0-unreviewed",
      summary,
      steps,
      dos,
      donts,
      whenToSeekHelp,
      provenance: UNREVIEWED_PROVENANCE,
    },
  };
}

export const FIRST_AID_GUIDES: Record<EmergencyCategoryId, FirstAidGuide> = {
  burns: makeGuide(
    "burns",
    "Burns",
    "Learn what to do in case of burns and scalds.",
    [
      "Move the person away from the heat source.",
      "Cool the burn under cool running water for 10–20 minutes.",
      "Remove tight items (rings, watches) near the burn before it swells.",
      "Cover loosely with a clean, non-fluffy cloth or dressing.",
      "Seek medical help for large, deep, or facial/hand burns.",
    ],
    [
      "Cool the burn with cool (not ice-cold) running water.",
      "Cover with a clean, non-stick dressing.",
      "Keep the person warm and calm.",
    ],
    [
      "Do not apply ice, butter, or ointments to the burn.",
      "Do not burst any blisters.",
      "Do not remove clothing stuck to the burn.",
    ],
    [
      "Large, deep, or facial/hand burns",
      "All chemical or electrical burns",
      "Any burn larger than the person's palm",
    ],
  ),
  bleeding: makeGuide(
    "bleeding",
    "Bleeding",
    "Learn how to control bleeding in an emergency.",
    [
      "Apply firm, direct pressure to the wound with a clean cloth.",
      "Keep the pressure steady and raise the injured area if possible.",
      "Add more cloth on top if blood soaks through — do not remove the first layer.",
      "Bandage firmly once bleeding slows.",
      "Seek medical help for deep, spurting, or uncontrolled bleeding.",
    ],
    [
      "Apply firm, direct pressure.",
      "Keep the injured area raised above the heart if possible.",
      "Reassure and keep the person still.",
    ],
    [
      "Do not remove an embedded object from the wound.",
      "Do not remove a soaked dressing — add more on top instead.",
      "Do not use a tourniquet unless trained and bleeding is life-threatening.",
    ],
    [
      "Deep, spurting, or uncontrolled bleeding",
      "Bleeding that does not stop after 10 minutes of pressure",
      "Shock symptoms (pale, cold, clammy, confused)",
    ],
  ),
  choking: makeGuide(
    "choking",
    "Choking",
    "Steps to help someone who is choking.",
    [
      "Ask the person if they are choking — if they can cough or speak, encourage coughing.",
      "If they cannot breathe, cough, or speak, give up to 5 back blows between the shoulder blades.",
      "If that fails, give up to 5 abdominal thrusts (Heimlich manoeuvre).",
      "Repeat the cycle of back blows and abdominal thrusts.",
      "If the airway stays blocked, call for emergency medical help immediately.",
    ],
    [
      "Encourage the person to keep coughing if they still can.",
      "Give firm back blows between the shoulder blades.",
      "Call for emergency help if the blockage does not clear.",
    ],
    [
      "Do not perform abdominal thrusts on infants — use back blows and chest thrusts instead.",
      "Do not reach into the mouth blindly to try to remove the object.",
      "Do not leave the person alone.",
    ],
    [
      "Airway stays blocked after back blows and thrusts",
      "Person becomes unconscious (start CPR if trained)",
      "After any abdominal thrusts, even if successful",
    ],
  ),
  "snake-bite": makeGuide(
    "snake-bite",
    "Snake Bite",
    "First aid for snake bite victims.",
    [
      "Keep the victim calm and still.",
      "Immobilize the affected limb.",
      "Remove rings, watches or tight clothing near the bite.",
      "Do not cut the wound or try to suck out the venom.",
      "Seek medical help immediately — antivenom requires professional care.",
    ],
    ["Keep the victim still.", "Seek professional medical care immediately."],
    [
      "Do not cut the bite.",
      "Do not suck out the venom.",
      "Do not apply harmful substances or a tight tourniquet.",
    ],
    [
      "Every snake bite requires professional medical evaluation",
      "Swelling spreading beyond the bite",
      "Difficulty breathing or altered consciousness",
    ],
  ),
  "road-accident": makeGuide(
    "road-accident",
    "Road Accident",
    "What to do in a road traffic accident.",
    [
      "Ensure the scene is safe before approaching.",
      "Call for emergency help and share your exact location.",
      "Do not move injured people unless there is immediate danger.",
      "Check for breathing and severe bleeding, and treat what you can.",
      "Keep the person calm and still until help arrives.",
    ],
    [
      "Check the scene is safe before helping.",
      "Call for emergency help right away.",
      "Keep injured people still and calm.",
    ],
    [
      "Do not move a casualty with a suspected spinal injury.",
      "Do not remove a motorcycle helmet unless absolutely necessary.",
      "Do not leave the person unattended.",
    ],
    [
      "Every road accident with injuries",
      "Suspected spinal injury — do not move the casualty",
      "Any head injury or unconsciousness",
    ],
  ),
  fractures: makeGuide(
    "fractures",
    "Fractures",
    "How to manage fractures and broken bones.",
    [
      "Keep the injured area still and supported.",
      "Immobilize the limb using a splint or sling if trained to do so.",
      "Apply a cold pack wrapped in cloth to reduce swelling.",
      "Check for circulation beyond the injury (colour, warmth, feeling).",
      "Seek medical help for proper diagnosis and treatment.",
    ],
    [
      "Keep the injured area supported and still.",
      "Apply a wrapped cold pack to reduce swelling.",
      "Get medical attention for an X-ray and proper care.",
    ],
    [
      "Do not try to straighten or realign the bone.",
      "Do not move the person unnecessarily.",
      "Do not let the person eat or drink in case surgery is needed.",
    ],
    [
      "Suspected fracture always requires medical care",
      "Visible deformity or bone through skin",
      "No circulation beyond the injury",
    ],
  ),
};

export const GUIDE_LIST: FirstAidGuide[] = Object.values(FIRST_AID_GUIDES);

/**
 * Version of the bundled first-aid content package. All bundled guides share
 * this version while content is served from the static dataset; the offline
 * package records which version was downloaded so the UI can honestly flag
 * "update available".
 */
export const CONTENT_VERSION = "0.1.0-unreviewed";
