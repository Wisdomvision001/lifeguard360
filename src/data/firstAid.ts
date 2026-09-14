import type {
  EmergencyCategoryId,
  FirstAidGuide,
  GuideProvenance,
  GuideStep,
  QuickGuide,
} from "@/types";

/**
 * Static first-aid content for the six core categories.
 *
 * PROVENANCE & REVIEW STATUS (AD-15):
 * - Medical wording is the prototype content, pending review against a
 *   verified first-aid source (St John Ambulance / WHO / Nigerian Red Cross).
 * - Nothing here is presented as clinically approved until `reviewedBy` and
 *   `provenance` are populated by the review process.
 *
 * CANONICAL-PROTOCOL PRINCIPLE: each category has exactly one medical
 * protocol. `content.steps` is the canonical sequence; `quickGuide` is a
 * compressed, explicitly stored presentation of the SAME protocol — never a
 * second protocol. Wording changes identified by the Medical Content
 * Specification that are still awaiting human sign-off are deliberately NOT
 * applied here (content stays `0.1.0-unreviewed`).
 */

const UNREVIEWED_PROVENANCE: GuideProvenance[] = [
  {
    claim: "All instructions in this guide",
    source: "Prototype content — pending verified first-aid source review",
    verifiedAt: "",
  },
];

interface StepInput {
  title: string;
  text: string;
  image?: string;
  imageAlt?: string;
  warning?: string;
}

function makeGuide(
  id: EmergencyCategoryId,
  label: string,
  summary: string,
  image: string,
  steps: StepInput[],
  dos: string[],
  donts: string[],
  whenToSeekHelp: string[],
  quickGuide: QuickGuide,
): FirstAidGuide {
  return {
    id,
    label,
    summary,
    iconClass: `icon-${id}`,
    image,
    content: {
      contentVersion: "0.1.0-unreviewed",
      summary,
      steps: steps.map(
        ({ title, text, image, imageAlt, warning }): GuideStep => ({
          title,
          text,
          ...(image !== undefined && { image }),
          ...(imageAlt !== undefined && { imageAlt }),
          ...(warning !== undefined && { warning }),
        }),
      ),
      dos,
      donts,
      whenToSeekHelp,
      quickGuide,
      // `variants` and `video` stay unset until their own implementation
      // tasks land (variant UI / video integration). No fake asset paths.
      provenance: UNREVIEWED_PROVENANCE.map((entry) => ({ ...entry })),
    },
  };
}

export const FIRST_AID_GUIDES: Record<EmergencyCategoryId, FirstAidGuide> = {
  burns: makeGuide(
    "burns",
    "Burns",
    "Learn what to do in case of burns and scalds.",
    "/images/burns.jpg",
    [
      { title: "Stop the burning", text: "Move the person away from the heat source." },
      {
        title: "Cool the burn",
        text: "Cool the burn under cool running water for 10–20 minutes.",
        image: "/images/first-aid/burns/burns-cool-running-water.jpg",
        imageAlt:
          "Photograph of a hand held under cool running water from a tap, demonstrating cooling a burn.",
      },
      {
        title: "Remove tight items",
        text: "Remove tight items (rings, watches) near the burn before it swells.",
      },
      {
        title: "Cover the burn",
        text: "Cover loosely with a clean, non-fluffy cloth or dressing.",
      },
      {
        title: "Seek medical help",
        text: "Seek medical help for large, deep, or facial/hand burns.",
      },
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
    {
      immediatePriority: "Stop the burning and cool the burn.",
      essentialActions: [
        "Move away from the heat source.",
        "Cool under cool running water for 10–20 minutes.",
        "Remove tight items (rings, watches) before swelling.",
        "Cover loosely with a clean, non-fluffy cloth or dressing.",
        "Keep the person warm and calm.",
      ],
      criticalDonts: [
        "Do not apply ice, butter, or ointments.",
        "Do not burst blisters.",
        "Do not remove clothing stuck to the burn.",
      ],
    },
  ),
  bleeding: makeGuide(
    "bleeding",
    "Bleeding",
    "Learn how to control bleeding in an emergency.",
    "/images/bleeding.jpg",
    [
      {
        title: "Apply direct pressure",
        text: "Apply firm, direct pressure to the wound with a clean cloth.",
      },
      {
        title: "Keep pressure steady",
        text: "Keep the pressure steady and raise the injured area if possible.",
      },
      {
        title: "Layer if blood soaks through",
        text: "Add more cloth on top if blood soaks through — do not remove the first layer.",
      },
      {
        title: "Bandage",
        text: "Bandage firmly once bleeding slows.",
        image: "/images/first-aid/bleeding/bleeding-bandage.jpg",
        imageAlt:
          "Photograph of hands securing a bandage around an injured wrist.",
      },
      {
        title: "Seek medical help",
        text: "Seek medical help for deep, spurting, or uncontrolled bleeding.",
      },
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
    {
      immediatePriority: "Stop the blood with firm, direct pressure.",
      essentialActions: [
        "Apply firm, direct pressure to the wound with a clean cloth.",
        "Keep the pressure steady and raise the injured area if possible.",
        "Add more cloth on top if blood soaks through — do not remove the first layer.",
        "Bandage firmly once bleeding slows.",
        "Seek medical help for deep, spurting, or uncontrolled bleeding.",
      ],
      criticalDonts: [
        "Do not remove an embedded object from the wound.",
        "Do not remove a soaked dressing — add more on top instead.",
        "Do not use a tourniquet unless trained and bleeding is life-threatening.",
      ],
    },
  ),
  choking: makeGuide(
    "choking",
    "Choking",
    "Steps to help someone who is choking.",
    "/images/choking.jpg",
    [
      {
        title: "Ask & encourage coughing",
        text: "Ask the person if they are choking — if they can cough or speak, encourage coughing.",
      },
      {
        title: "Back blows",
        text: "If they cannot breathe, cough, or speak, give up to 5 back blows between the shoulder blades.",
        image: "/images/first-aid/choking/choking-back-blows.jpg",
        imageAlt:
          "Illustration of a choking adult leaning forward while a rescuer delivers a back blow between the shoulder blades with the heel of the hand.",
      },
      {
        title: "Abdominal thrusts",
        text: "If that fails, give up to 5 abdominal thrusts (Heimlich manoeuvre).",
        image: "/images/first-aid/choking/choking-abdominal-thrusts.jpg",
        imageAlt:
          "Illustration showing a rescuer standing behind a choking adult with a clenched fist placed against the abdomen between the navel and the bottom of the chest, the other hand grasping the fist.",
      },
      {
        title: "Repeat cycles",
        text: "Repeat the cycle of back blows and abdominal thrusts.",
      },
      {
        title: "Get emergency help",
        text: "If the airway stays blocked, call for emergency medical help immediately.",
      },
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
    {
      immediatePriority: "Keep the airway working — encourage coughing, then back blows, then thrusts.",
      essentialActions: [
        "Ask if they are choking — if they can cough or speak, encourage coughing.",
        "Give up to 5 back blows between the shoulder blades.",
        "If that fails, give up to 5 abdominal thrusts.",
        "Repeat the cycle of back blows and abdominal thrusts.",
        "If the airway stays blocked, call for emergency medical help immediately.",
      ],
      criticalDonts: [
        "Do not perform abdominal thrusts on infants.",
        "Do not reach into the mouth blindly.",
        "Do not leave the person alone.",
      ],
    },
  ),
  "snake-bite": makeGuide(
    "snake-bite",
    "Snake Bite",
    "First aid for snake bite victims.",
    "/images/snake-bite.jpg",
    [
      { title: "Keep calm & still", text: "Keep the victim calm and still." },
      { title: "Immobilise the limb", text: "Immobilize the affected limb." },
      {
        title: "Remove constrictors",
        text: "Remove rings, watches or tight clothing near the bite.",
      },
      {
        title: "Do nothing harmful",
        text: "Do not cut the wound or try to suck out the venom.",
      },
      {
        title: "Get to hospital",
        text: "Seek medical help immediately — antivenom requires professional care.",
      },
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
    {
      immediatePriority: "Keep the victim calm and still, and get them to hospital.",
      essentialActions: [
        "Keep the victim calm and still.",
        "Immobilize the affected limb.",
        "Remove rings, watches or tight clothing near the bite.",
        "Seek medical help immediately — antivenom requires professional care.",
      ],
      criticalDonts: [
        "Do not cut the bite.",
        "Do not suck out the venom.",
        "Do not apply harmful substances or a tight tourniquet.",
      ],
    },
  ),
  "road-accident": makeGuide(
    "road-accident",
    "Road Accident",
    "What to do in a road traffic accident.",
    "/images/road-accident.jpg",
    [
      { title: "Make the scene safe", text: "Ensure the scene is safe before approaching." },
      {
        title: "Call for help",
        text: "Call for emergency help and share your exact location.",
      },
      {
        title: "Do not move casualties",
        text: "Do not move injured people unless there is immediate danger.",
      },
      {
        title: "Check & treat",
        text: "Check for breathing and severe bleeding, and treat what you can.",
      },
      {
        title: "Stay until help arrives",
        text: "Keep the person calm and still until help arrives.",
      },
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
    {
      immediatePriority: "Protect the scene, then get help.",
      essentialActions: [
        "Ensure the scene is safe before approaching.",
        "Call for emergency help and share your exact location.",
        "Do not move injured people unless there is immediate danger.",
        "Check for breathing and severe bleeding, and treat what you can.",
        "Keep the person calm and still until help arrives.",
      ],
      criticalDonts: [
        "Do not move a casualty with a suspected spinal injury.",
        "Do not remove a motorcycle helmet unless absolutely necessary.",
        "Do not leave the person unattended.",
      ],
    },
  ),
  fractures: makeGuide(
    "fractures",
    "Fractures",
    "How to manage fractures and broken bones.",
    "/images/fractures.jpg",
    [
      { title: "Keep still & support", text: "Keep the injured area still and supported." },
      {
        title: "Immobilise",
        text: "Immobilize the limb using a splint or sling if trained to do so.",
      },
      {
        title: "Cold pack",
        text: "Apply a cold pack wrapped in cloth to reduce swelling.",
      },
      {
        title: "Check circulation",
        text: "Check for circulation beyond the injury (colour, warmth, feeling).",
      },
      {
        title: "Get medical help",
        text: "Seek medical help for proper diagnosis and treatment.",
      },
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
    {
      immediatePriority: "Keep it still — never straighten it.",
      essentialActions: [
        "Keep the injured area still and supported.",
        "Immobilize the limb using a splint or sling if trained to do so.",
        "Check for circulation beyond the injury (colour, warmth, feeling).",
        "Seek medical help for proper diagnosis and treatment.",
      ],
      criticalDonts: [
        "Do not try to straighten or realign the bone.",
        "Do not move the person unnecessarily.",
        "Do not let the person eat or drink in case surgery is needed.",
      ],
    },
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
