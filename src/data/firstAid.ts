import type {
  EmergencyCategoryId,
  FirstAidGuide,
  GuideProvenance,
  GuideStep,
  QuickGuide,
  TreatmentAction,
  PatientGroup,
  TreatmentContent,
  TreatmentStep,
} from "@/types";

/**
 * Static first-aid content for the supported emergency categories.
 *
 * PROVENANCE & REVIEW STATUS:
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
 *
 * NEW-GUIDE INTEGRATION NOTE: each new EmergencyCategoryId added to the type
 * must have a matching entry here AND a corresponding entry in
 * src/data/categoryMeta.ts so the admin registry, dashboard, and bundled
 * fallback all remain consistent.
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
  /** Which patient groups this step applies to. Passed through to the rendered GuideStep. */
  appliesTo?: readonly PatientGroup[] | "all";
}

/** Practical treatment content for a guide. This is the Phase 1 deliverable:
 * ordered, understandable, age-aware first-aid procedure text, presented as
 * curated content rather than runtime-generated instructions.
 *
 * All content here is unreviewed prototype wording pending verification
 * against a recognized first-aid source. Nothing here is clinically approved.
 */
function makeTreatment(
  summary: string,
  immediateActions: TreatmentAction[],
  steps: TreatmentStep[],
  avoid: string[],
  escalationCriteria: string[],
  requiresAgeBeforeProcedure = false,
  ageApplicability = "",
): TreatmentContent {
  return {
    summary,
    immediateActions,
    steps,
    avoid,
    escalationCriteria,
    sources: UNREVIEWED_PROVENANCE.map((entry) => ({ ...entry })),
    reviewStatus: "unreviewed",
    contentVersion: "0.1.0-unreviewed",
    requiresAgeBeforeProcedure,
    ageApplicability,
  };
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
  treatment?: TreatmentContent,
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
        ({ title, text, image, imageAlt, warning, appliesTo }): GuideStep => ({
          title,
          text,
          ...(image !== undefined && { image }),
          ...(imageAlt !== undefined && { imageAlt }),
          ...(warning !== undefined && { warning }),
          appliesTo: appliesTo ?? (["adult", "teen"] as const),
        }),
      ),
      dos,
      donts,
      whenToSeekHelp,
      quickGuide,
      // `variants` and `video` stay unset until their own implementation
      // tasks land (variant UI / video integration). No fake asset paths.
      provenance: UNREVIEWED_PROVENANCE.map((entry) => ({ ...entry })),
      ...(treatment !== undefined && { treatment }),
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
      {
        title: "Stop the burning",
        text: "Move the person away from the heat source.",
        image: "/images/first-aid/burns/burns-hot-liquid-sequence.jpg",
        imageAlt:
          "Sequence illustration showing a scald from hot liquid, then moving the person away from the heat source and removing the source of the burn.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Cool the burn",
        text: "Cool the burn under cool running water for 10–20 minutes.",
        image: "/images/first-aid/burns/burns-cool-running-water.jpg",
        imageAlt:
          "Photograph of a hand held under cool running water from a tap, demonstrating cooling a burn.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Remove tight items",
        text: "Remove tight items (rings, watches) near the burn before it swells.",
        image: "/images/first-aid/burns/burns-remove-watch-and-jewellery.jpg",
        imageAlt:
          "Illustration of a watch being slid off a burned forearm, showing that rings, watches and tight items are removed near a burn before it swells.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Cover the burn",
        text: "Cover loosely with a clean, non-fluffy cloth or dressing.",
        image: "/images/first-aid/burns/burns-dressing-and-bandage.jpg",
        imageAlt:
          "Illustration of a non-adherent sterile dressing applied to a burned forearm and held with a light bandage wound loosely in place, with a caution that the bandage should be checked frequently for tightness as swelling may occur.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Seek medical help",
        text: "Seek medical help for large, deep, or facial/hand burns.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
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
    makeTreatment(
      "A burn is damage to the skin from heat, scald, flame, chemicals, or electricity. The first priorities are to stop the burning process, cool the area safely, and protect the burn. Some burns need urgent medical care.",
      [
        {
          title: "Stop the burning process",
          text: "Move the person away from the heat source. If clothing is on fire, help them drop to the ground and roll if needed, or use a blanket or coat to smother the flames.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Cool the burn with cool running water",
          text: "Hold the burned area under cool running water for about 10 to 20 minutes. Use cool water, not ice-cold water.",
          caution: "Do not use ice or very cold water directly on the burn.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Remove jewellery or tight items early",
          text: "Remove rings, watches, bracelets, or tight clothing near the burn before swelling starts, if they are not stuck to the skin.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Cover the burn loosely",
          text: "After cooling, cover the burn loosely with a clean, non-fluffy cloth or sterile dressing.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Get help for serious burns",
          text: "Get medical help for large, deep, facial, hand, or joint burns, or for any burn in a baby or small child that looks serious.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "burns-stop-burning",
          order: 1,
          title: "Stop the burning process safely",
          instruction: "Move the person away from the heat source. If clothing is on fire, help them stop, drop to the ground, and roll, or use a coat or blanket to smother the flames.",
          explanation: "Burns can continue to damage deeper tissue after the obvious heat source is gone. Removing the source and, when needed, smothering flames limits further injury.",
          warning: "Do not put yourself at risk. If the fire is large or the environment is unsafe, get help and keep others clear.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "burns-cool",
          image: "/images/first-aid/burns/burns-cool-under-tap-20-minutes.jpg",
          imageAlt:
            "Illustration of a burned forearm being held under running cool tap water for about 10 to 20 minutes, with the water kept cool rather than ice-cold.",
          order: 2,
          title: "Cool the burn with cool running water",
          instruction: "Run cool tap water over the burn for about 10 to 20 minutes. Use cool water, not ice or very cold water.",
          explanation: "Cooling helps reduce pain, swelling, and deeper tissue damage. The water should feel cool, not freezing. Cooling is especially important in the first minutes after the burn.",
          warning: "Do not apply ice directly to a burn. Do not use freezing water or ice packs, which can damage the skin further. Keep the rest of the person warm while cooling the burn.",
          nextStepCriteria: "Pain should ease somewhat and the burn no longer feels hot. Continue cooling if pain persists within the recommended time.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              instruction: "For a baby, cool the burn gently with cool running water for the recommended time while supporting the baby and keeping them warm.",
              explanation: "Babies lose body heat quickly. Cool only the burned area and keep the rest of the infant warm.",
            },
          ],
        },
        {
          id: "burns-remove-items",
          order: 3,
          title: "Remove jewellery or tight items near the burn",
          instruction: "Remove rings, watches, bracelets, or tight clothing near the burned area before swelling starts, if they are not stuck to the skin.",
          explanation: "Burns swell quickly. Items near the burn can become constrictive and restrict blood flow. Removing them early prevents problems later.",
          warning: "Do not remove clothing or items stuck to the burn. Cut around clothing stuck to the skin rather than pulling it off.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "burns-cover",
          image: "/images/first-aid/burns/burns-do-not-use-cream-ice-ointments.jpg",
          imageAlt:
            "Illustration showing a burned area being covered with a clean non-fluffy dressing while crossing out applying cream, ice, butter, or ointments to the burn.",
          order: 4,
          title: "Cover the burn loosely",
          instruction: "After cooling, cover the burn loosely with a clean, non-fluffy cloth or sterile dressing. Do not wrap tightly.",
          explanation: "Covering the burn protects it from infection and friction. A loose cover reduces pain without putting pressure on damaged skin.",
          warning: "Do not use fluffy materials that may leave fibres on the wound. Do not burst blisters; blisters help protect the area underneath.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "burns-severity",
          image: "/images/first-aid/burns/burns-cool-large-burn-20-minutes.jpg",
          imageAlt:
            "Illustration of a rescuer cooling a large burn with running water for about 20 minutes while arranging urgent medical help for the serious burn.",
          order: 5,
          title: "Recognise burns that need urgent medical care",
          instruction: "Get urgent medical help for large or deep burns, burns to the face, hands, feet, joints, or genitals, all chemical and electrical burns, burns larger than the person’s palm, or any burn in a baby or small child that seems serious.",
          explanation: "Some burns carry a higher risk of infection, scarring, loss of function, or hidden deeper injury. Chemical and electrical burns can cause damage beyond what is visible on the skin.",
          warning: "For chemical burns, follow the safety instructions on the product or safety data sheet if available, and get professional help. For electrical burns, treat the person as injured even if the skin looks minor.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          followUp: {
            type: "escalate",
            label: "Get urgent medical help for serious burns.",
          },
        },
        {
          id: "burns-pain-care",
          order: 6,
          title: "Keep the person warm and comfortable",
          instruction: "After cooling the burn, keep the person warm with blankets or clothing, and keep them calm and still.",
          explanation: "Cooling a burn is different from cooling the whole person. Large burns can lead to heat loss and shock, so the person should be kept warm overall once the burn itself has been cooled.",
          warning: "Do not overheat the burned area or cover it in a way that traps heat against the wound.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        "Do not apply ice, butter, or ointments to the burn.",
        "Do not burst any blisters.",
        "Do not remove clothing stuck to the burn.",
        "Do not use fluffy cotton or materials that leave fibres on the wound.",
        "Do not apply toothpaste, egg, or other home remedies to a burn.",
      ],
      [
        "Large, deep, or facial/hand/foot/joint burns",
        "All chemical or electrical burns",
        "Any burn larger than the person’s palm",
        "Burns in a baby or small child that look serious",
        "A burn that is blistered, leaking, or very painful and does not improve",
      ],
      false,
      "Cooling and covering a burn is broadly similar for all ages, but babies and small children lose heat faster and deteriorate more quickly, so serious burns in infants and children should always be treated urgently.",
    ),
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
        image: "/images/first-aid/bleeding/bleeding-direct-pressure.jpg",
        imageAlt:
          "Illustration of a hand pressing a bulky sterile pad firmly over a bleeding forearm wound, with a reminder to call emergency services if the victim becomes unconscious.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Keep pressure steady",
        text: "Keep the pressure steady and raise the injured area if possible.",
        image: "/images/first-aid/bleeding/bleeding-raise-limb-above-heart.jpg",
        imageAlt:
          "Illustration of a bandaged forearm held above a dashed line labelled above heart, showing an injured limb raised above the level of the heart while pressure is kept on the wound.",
        appliesTo: ["adult", "teen", "child"] as const,
      },
      {
        title: "Layer if blood soaks through",
        text: "Add more cloth on top if blood soaks through — do not remove the first layer.",
        image: "/images/first-aid/bleeding/bleeding-additional-pad-if-leaking.jpg",
        imageAlt:
          "Illustration of a fresh pad being laid over a blood-stained bandage on a forearm and re-bandaged with firm pressure, without removing the first dressing.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Bandage",
        text: "Bandage firmly once bleeding slows.",
        image: "/images/first-aid/bleeding/bleeding-bandage.jpg",
        imageAlt:
          "Photograph of hands securing a bandage around an injured wrist.",
        appliesTo: ["adult", "teen", "child"] as const,
      },
      {
        title: "Seek medical help",
        text: "Seek medical help for deep, spurting, or uncontrolled bleeding.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
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
    makeTreatment(
      "Bleeding is blood escaping from a wound. Most bleeding can be controlled with firm direct pressure. Severe, spurting, or uncontrolled bleeding is life-threatening and needs emergency medical help fast.",
      [
        {
          title: "Protect yourself and stop the bleeding",
          text: "If possible, put on gloves or use a barrier before touching blood. Wash your hands thoroughly after. Stop the bleeding with gentle pressure first if needed.",
          caution: "Avoid direct contact with blood if you can.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Apply firm direct pressure",
          text: "Press firmly directly on the wound with a clean cloth, gauze, or the cleanest material available.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Raise the injured area if it is safe",
          text: "If the injury is on a limb and you do not suspect a fracture, raise it above the level of the heart while keeping pressure on the wound.",
          caution: "Do not raise the limb if you think a bone is broken or moving it causes severe pain.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          title: "Call for emergency help if bleeding is severe",
          text: "If bleeding is spurting, does not slow with pressure, or is very heavy, call emergency services or have someone else call now.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "bleeding-protect",
          order: 1,
          title: "Protect yourself from blood exposure",
          instruction: "Before touching the wound, use gloves, a plastic bag, or another clean barrier if available. If none is available, use the cleanest cloth you have.",
          explanation: "Blood can carry infections. Reducing direct contact protects both you and the injured person. If you have no protection, use pressure through a cloth rather than with bare hands for longer than necessary.",
          warning: "Do not delay pressure for long while searching for supplies. Firm pressure matters more than perfect protection.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "bleeding-apply-pressure",
          image: "/images/first-aid/bleeding/bleeding-stop-bleeding-pressure-pad.jpg",
          imageAlt:
            "Illustration of a hand pressing a sterile pressure pad firmly onto a bleeding wound to stop the bleeding, with the pad kept flat over the wound.",
          order: 2,
          title: "Apply firm, direct pressure to the wound",
          instruction: "Place a clean cloth, gauze pad, or other clean material directly on the wound and press firmly with the palm of your hand.",
          explanation: "Direct pressure is the primary way to control most bleeding. Press hard enough to slow or stop the flow. Keep the pressure steady; lifting to check too often can restart bleeding.",
          warning: "Do not press directly over an object stuck in the wound. Press around it if you can, and build up padding to avoid pressing on the object.",
          nextStepCriteria: "Bleeding should slow or stop. If blood soaks through, add more layers on top without removing the first one.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              instruction: "For a baby, use gentle but firm pressure with clean gauze or cloth and keep the infant as still and calm as possible.",
              explanation: "Infants can lose blood quickly relative to their size. Keep the baby warm and minimise movement while maintaining pressure.",
            },
          ],
        },
        {
          id: "bleeding-keep-pressure",
          order: 3,
          title: "Keep pressure steady and raise the limb if possible",
          instruction: "Continue pressing on the wound. If the injury is on an arm or leg and you do not suspect a fracture, raise it above the level of the heart.",
          explanation: "Raising the limb uses gravity to reduce blood flow to the area while pressure controls the bleeding. This is a support to direct pressure, not a replacement for it.",
          warning: "Do not raise the limb if you suspect a broken bone, joint injury, or if moving it causes severe pain.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          id: "bleeding-layer",
          order: 4,
          title: "Add more cloth if blood soaks through",
          instruction: "If blood soaks through the first dressing, add more clean cloth or gauze on top and keep pressing. Do not remove the first layer.",
          explanation: "Removing the first dressing can disturb the clot that is starting to form. Build up layers on top instead and keep firm pressure.",
          warning: "If blood continues to soak through many layers rapidly, this is a sign of severe bleeding — get emergency help now.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "bleeding-bandage",
          image: "/images/first-aid/bleeding/bleeding-bandage-firmly.jpg",
          imageAlt:
            "Illustration of a bandage being wound firmly over a dressed wound, tight enough to hold pressure but not so tight that it cuts off circulation.",
          order: 5,
          title: "Bandage firmly once bleeding slows",
          instruction: "Once bleeding is controlled, wrap a clean bandage or dressing over the wound and secure it firmly enough to hold pressure, but not so tightly that it cuts off circulation.",
          explanation: "A firm dressing helps maintain pressure and protects the wound. Check the hand or foot beyond the bandage for colour, warmth, and feeling.",
          warning: "If the fingers or toes beyond the bandage become pale, cold, numb, or tingly, the bandage may be too tight. Loosen it and reassess.",
          nextStepCriteria: "The bandage holds the dressing in place and bleeding remains controlled.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          id: "bleeding-severe",
          order: 6,
          title: "Recognise life-threatening bleeding and act fast",
          instruction: "If bleeding is spurting, cannot be controlled with pressure, or is very heavy, call emergency services immediately and keep pressing. If trained and bleeding is life-threatening from a limb, a commercial tourniquet may be used as a last resort according to its instructions.",
          explanation: "Life-threatening bleeding needs urgent professional care. A tourniquet is a specialized device designed for severe limb bleeding and is not the same as tying a rope, belt, or cloth tightly around a limb. It should only be used when indicated and ideally with training.",
          warning: "Do not use a random cloth, rope, or belt as a substitute for a proper tourniquet. Do not apply a tourniquet unless bleeding is life-threatening and you understand the device or are following trained instructions.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          id: "bleeding-embedded",
          image: "/images/first-aid/bleeding/bleeding-embedded-object-criss-cross.jpg",
          imageAlt:
            "Illustration of padding built up around an object embedded in a wound and secured with criss-cross bandaging, leaving the embedded object in place without pressing on it.",
          order: 7,
          title: "Do not remove an object stuck in the wound",
          instruction: "If something is embedded in the wound, leave it in place. Apply pressure around the object and build up padding to avoid pressing on it.",
          explanation: "An embedded object may be helping to plug the wound. Removing it can cause worse bleeding. Stabilise the object with dressings and get medical help.",
          warning: "Do not try to remove deeply embedded objects, glass, knives, or other objects. Do not poke or probe the wound.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "bleeding-shock",
          order: 8,
          title: "Watch for signs of shock and keep the person still",
          instruction: "If the person becomes pale, cold, clammy, dizzy, confused, or faint, call for emergency help, keep them lying down if possible, and keep them warm.",
          explanation: "Severe bleeding can lead to shock, where the body is not getting enough circulation. Lying the person down and keeping them warm can help while you wait for help.",
          warning: "Do not give the person anything to eat or drink. Reassure them and keep monitoring breathing and responsiveness.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        "Do not remove an embedded object from the wound.",
        "Do not remove a soaked dressing — add more on top instead.",
        "Do not use a tourniquet unless trained and bleeding is life-threatening.",
        "Do not use a rope, belt, or ordinary cloth tied tightly around a limb as a makeshift tourniquet.",
        "Do not remove the first dressing if blood soaks through.",
      ],
      [
        "Deep, spurting, or uncontrolled bleeding",
        "Bleeding that does not stop after about 10 minutes of firm pressure",
        "Shock symptoms such as pale, cold, clammy skin, dizziness, or confusion",
        "Bleeding from a serious wound, such as one with an embedded object",
        "Any severe bleeding in an infant or small child",
      ],
      false,
      "The basic steps of direct pressure apply to all ages. Babies and small children can deteriorate faster from blood loss, so severe bleeding in an infant or child should always be treated urgently.",
    ),
  ),
  choking: makeGuide(
    "choking",
    "Choking",
    "Steps to help someone who is choking.",
    "/images/choking.jpg",
    [
      {
        title: "Partial obstruction 1 — Reassure victim. Encourage victim to cough & breathe",
        text: "Assess if the cough is effective.",
        image: "/images/first-aid/choking/choking-encourage-coughing.jpg",
        imageAlt:
          "Illustration of a rescuer watching a seated person who is coughing with a hand at their throat, to assess whether the cough is effective.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Partial obstruction 2 — Monitor vital signs regularly",
        text: "Conscious state: Is the victim responding? Airway: Clear & open? Breathing: Normal rate (10 - 24) and rhythm, deep or shallow, quiet or noisy, any wheezing? Circulation: Check pulse (50 - 120) on underside of wrist at base of thumb. Is it fast or slow, strong or weak, regular or irregular? Disability: AVPU, A - Alert, V - Voice, P - Pain, U - Unconscious? Exposure: Monitor skin changes, including rashes?",
        image: "/images/first-aid/choking/choking-monitor-vital-signs.jpg",
        imageAlt:
          "Illustration of a rescuer monitoring a choking victim and calling emergency services, with a conscious state, airway, breathing, circulation, disability and exposure checklist.",
        warning:
          "If victim deteriorates: becomes distressed, is unable to cough effectively or is unable to relieve obstruction — CALL EMERGENCY.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Partial obstruction 3 — If unconscious, begin CPR",
        text: "Assist victim to the floor. Check victim's breathing. If not breathing begin CPR.",
        image: "/images/first-aid/choking/choking-unconscious-begin-cpr.jpg",
        imageAlt:
          "Illustration of an unresponsive choking victim being lowered safely to the floor so breathing can be checked and CPR started.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Partial obstruction 4 — No back blows if breathing",
        text: "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
        image: "/images/first-aid/choking/choking-no-back-blows-if-breathing.jpg",
        imageAlt:
          "Illustration contrasting a choking person who is breathing and coughing, who should not receive back blows, with a person in severe choking who cannot breathe.",
        warning:
          "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title:
          "Complete obstruction 1 — Give up to 5 back blows, checking victim for improvement after each one",
        text: "Give up to 5 back blows, checking victim for improvement after each one.",
        image: "/images/first-aid/choking/choking-back-blows-adult-baby-child.jpg",
        imageAlt:
          "Illustration of up to 5 back blows being given between the shoulder blades with the heel of the hand, shown for an adult, a baby, and a child.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Complete obstruction 2 — Give up to 5 chest thrusts",
        text: "Give up to 5 chest thrusts. Continue cycle of 5 back blows then 5 chest thrusts if victim remains conscious.",
        image: "/images/first-aid/choking/choking-chest-thrusts.jpg",
        imageAlt:
          "Illustration of chest thrusts being given to a seated adult, with the note to continue the cycle of 5 back blows then 5 chest thrusts while the victim remains conscious.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
    ],
    [
      "Reassure victim. Encourage victim to cough & breathe.",
      "Give up to 5 back blows, checking victim for improvement after each one.",
      "Give up to 5 chest thrusts.",
      "Continue cycle of 5 back blows then 5 chest thrusts if victim remains conscious.",
    ],
    [
      "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
    ],
    [
      "Victim deteriorates: becomes distressed, is unable to cough effectively or is unable to relieve obstruction",
      "Victim becomes unconscious (assist to the floor and begin CPR if not breathing)",
    ],
    {
      immediatePriority: "Reassure victim. Encourage victim to cough & breathe.",
      essentialActions: [
        "Give up to 5 back blows, checking victim for improvement after each one.",
        "Give up to 5 chest thrusts.",
        "Continue cycle of 5 back blows then 5 chest thrusts if victim remains conscious.",
        "If not breathing begin CPR.",
      ],
      criticalDonts: [
        "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
      ],
    },
    makeTreatment(
      "Choking is when something blocks the airway so the person cannot breathe, cough, or speak effectively. A person who can cough or speak may still clear the blockage themselves. Severe choking is a life-threatening emergency.",
      [
        {
          title: "Help them keep coughing",
          text: "If they can cough, speak, or breathe, encourage them to keep coughing and stay with them.",
          caution: "Do not slap their back while they are coughing effectively.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          title: "Start choking first aid if severe",
          text: "If they cannot breathe, cough, or speak, treat it as severe choking and begin back blows immediately.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          title: "Call for help early",
          text: "If another person is nearby, send them to call emergency services now. If you are alone, begin first aid and call when you can.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "choking-reassure-cough",
          image: "/images/first-aid/choking/choking-encourage-coughing.jpg",
          imageAlt:
            "Illustration of a rescuer watching a seated person who is coughing with a hand at their throat, to assess whether the cough is effective.",
          order: 1,
          title: "Partial obstruction 1 — Reassure victim. Encourage victim to cough & breathe",
          instruction: "Reassure victim. Encourage victim to cough & breathe. Assess if the cough is effective.",
          explanation: "A person who can still cough or speak often clears the blockage on their own. Interfering too early can make a partial blockage worse.",
          warning: "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "choking-monitor-vitals",
          image: "/images/first-aid/choking/choking-monitor-vital-signs.jpg",
          imageAlt:
            "Illustration of a rescuer monitoring a choking victim and calling emergency services, with a conscious state, airway, breathing, circulation, disability and exposure checklist.",
          order: 2,
          title: "Partial obstruction 2 — Monitor vital signs regularly",
          instruction: "Conscious state: Is the victim responding? Airway: Clear & open? Breathing: Normal rate (10 - 24) and rhythm, deep or shallow, quiet or noisy, any wheezing? Circulation: Check pulse (50 - 120) on underside of wrist at base of thumb. Is it fast or slow, strong or weak, regular or irregular? Disability: AVPU, A - Alert, V - Voice, P - Pain, U - Unconscious? Exposure: Monitor skin changes, including rashes?",
          explanation: "Monitoring vital signs regularly shows whether the victim is improving or deteriorating while the obstruction is still present.",
          warning: "If victim deteriorates: becomes distressed, is unable to cough effectively or is unable to relieve obstruction — CALL EMERGENCY.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "choking-unresponsive",
          image: "/images/first-aid/choking/choking-unconscious-begin-cpr.jpg",
          imageAlt:
            "Illustration of an unresponsive choking victim being lowered safely to the floor so breathing can be checked and CPR started.",
          order: 3,
          title: "Partial obstruction 3 — If unconscious, begin CPR",
          instruction: "Assist victim to the floor. Check victim's breathing. If not breathing begin CPR.",
          explanation: "An unresponsive choking victim may still have a blocked airway. Chest compressions can help dislodge the object and circulate blood. Only remove an object if you can see it.",
          warning: "Do not perform blind finger sweeps. Do not push on the throat. If you see an object, remove it; if you cannot see it, continue CPR and follow emergency dispatch instructions.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "choking-no-back-blows",
          image: "/images/first-aid/choking/choking-no-back-blows-if-breathing.jpg",
          imageAlt:
            "Illustration contrasting a choking person who is breathing and coughing, who should not receive back blows, with a person in severe choking who cannot breathe.",
          order: 4,
          title: "Partial obstruction 4 — No back blows if breathing",
          instruction: "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
          explanation: "A victim who is moving air does not need back blows or chest thrusts, and giving them can make a partial blockage worse.",
          warning: "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "choking-back-blows",
          image: "/images/first-aid/choking/choking-back-blows-adult-baby-child.jpg",
          imageAlt:
            "Illustration of up to 5 back blows being given between the shoulder blades with the heel of the hand, shown for an adult, a baby, and a child.",
          order: 5,
          title: "Complete obstruction 1 — Give up to 5 back blows, checking victim for improvement after each one",
          instruction: "Give up to 5 back blows, checking victim for improvement after each one.",
          explanation: "Each blow should be sharp and directed between the shoulder blades. Check between blows to see whether the blockage has cleared. The same action is shown for an adult, a baby, and a child.",
          warning: "For babies, support the infant face-down along your forearm with the head lower than the chest and use the heel of the hand, not a fist.",
          nextStepCriteria: "If the object comes out, stop and assess breathing. If it does not come out after 5 back blows, move to chest thrusts.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              instruction: "Support the infant face-down along your forearm, with the head lower than the chest. Give up to 5 firm back blows between the shoulder blades with the heel of your hand.",
              explanation: "An infant’s body is too small for adult-style standing support. Keep the baby’s head and neck supported and do not tilt the head excessively. Use the heel of the hand, not a fist.",
            },
          ],
        },
        {
          id: "choking-chest-thrusts",
          image: "/images/first-aid/choking/choking-chest-thrusts.jpg",
          imageAlt:
            "Illustration of chest thrusts being given to a seated adult, with the note to continue the cycle of 5 back blows then 5 chest thrusts while the victim remains conscious.",
          order: 6,
          title: "Complete obstruction 2 — Give up to 5 chest thrusts",
          instruction: "Give up to 5 chest thrusts. Continue cycle of 5 back blows then 5 chest thrusts if victim remains conscious.",
          explanation: "Each thrust aims to increase pressure in the chest and dislodge the object. Alternate between back blows and chest thrusts until the blockage clears or the victim becomes unresponsive.",
          warning: "Do not give back blows or chest thrusts on a victim who is able to breathe, speak, cry or cough effectively.",
          nextStepCriteria: "If the object comes out, stop and check breathing. Continue the cycle of 5 back blows then 5 chest thrusts while the victim remains conscious.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          followUp: {
            type: "escalate",
            label: "Call emergency services now if not already done.",
          },
        },
      ],
      [
        "Do not perform abdominal thrusts on infants — use back blows and chest thrusts instead.",
        "Do not reach into the mouth blindly to try to remove the object.",
        "Do not leave the person alone.",
        "Do not give food or drink to a person who is choking.",
      ],
      [
        "The airway stays blocked after back blows and thrusts",
        "The person becomes unconscious",
        "After any abdominal thrusts, even if successful",
        "The infant or child has a persistent blockage and is deteriorating",
      ],
      true,
      "Choking first aid differs by age. Infants do not receive abdominal thrusts; they receive back blows and chest thrusts. Adults and older children usually receive back blows and abdominal thrusts. If the person becomes unresponsive, emergency response and CPR are needed regardless of age.",
    ),
  ),
  "snake-bite": makeGuide(
    "snake-bite",
    "Snake Bite",
    "First aid for snake bite victims.",
    "/images/snake-bite.jpg",
    [
      {
        title: "1 — Not supplied in the reference screenshots",
        text: "The supplied screenshots for this guide begin at step 2. Step 1 of the reference sequence was not provided and has not been written.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "2 — Stop & drop",
        text: "Sit or lie the victim down & remain calm. Victim should remain still. Call simultaneously.",
        image: "/images/first-aid/snake-bite/snake-bite-stop-and-drop.jpg",
        imageAlt:
          "Illustration of a snake-bite victim sitting down and staying still while the rescuer calls emergency services at the same time.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "3 — Remove watch, jewellery, rings",
        text: "Remove jewellery, bracelet, watch from affected limb. Consider applying gauze dressing to bite site. Start bandage from extremity. Tension to make rectangles on bandage into squares or tension same as sprained ankle.",
        image: "/images/first-aid/snake-bite/snake-bite-remove-jewellery.jpg",
        imageAlt:
          "Illustration of a bandage being applied from the extremity over a bitten limb, with a note to use tension that turns the rectangles on the bandage into squares.",
        warning: "Reduce tension for people with low muscle mass eg: elderly or children",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "4 — Apply SMART (pressure) bandage",
        text: "Mark bite site on bandage.",
        image: "/images/first-aid/snake-bite/snake-bite-pressure-bandage.jpg",
        imageAlt:
          "Illustration of a SMART pressure bandage applied over a bitten forearm with the bite site marked on the bandage, leaving the fingertips visible.",
        warning:
          "Do not remove clothing. Bandage over or cut it away. Leave fingertips/toes visible to monitor circulation",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "5 — Splint & immobilise",
        text: "Fit splint to limb: Use your limb to mould splint into rough shape. Fasten with conforming bandage. Immobilise by bandaging legs together. Place pad between legs with clothing or blanket. Tie legs together using strips of bandage/ narrow triangular bandage through hollows of knees & ankles.",
        image: "/images/first-aid/snake-bite/snake-bite-splint-and-immobilise.jpg",
        imageAlt:
          "Illustration of a survival splint moulded to a bitten limb and fastened with a conforming bandage so that all movement is reduced.",
        warning: "Reduce all movement by victim",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "6 — Monitor & reassure the victim",
        text: "Tell the victim that correct first aid measures are in place & that they will be OK. If the victim is semi-conscious or vomiting, gently roll them onto their side (Recovery Position). Monitor unconscious victim & commence CPR if breathing stops.",
        image: "/images/first-aid/snake-bite/snake-bite-monitor-and-reassure.jpg",
        imageAlt:
          "Illustration of a rescuer reassuring a snake-bite victim lying down with the bandaged limb supported, and monitoring an unconscious victim for breathing.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "7 — Bring transport to the victim",
        text: "Bring transport to the victim.",
        image: "/images/first-aid/snake-bite/snake-bite-transport-to-victim.jpg",
        imageAlt:
          "Illustration of an ambulance being brought to a snake-bite victim, with a reminder not to allow the victim to move.",
        warning:
          "Do not allow victim to move. Do not attempt to kill the snake. Do not apply a tourniquet. Do not cut, suck or wash the bite. Do not apply chemicals or antiseptics. Do not give medication or alcohol. Do not remove bandages.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
    ],
    [
      "Sit or lie the victim down & remain calm. Victim should remain still.",
      "Remove jewellery, bracelet, watch from affected limb.",
      "Apply a SMART (pressure) bandage and mark the bite site on the bandage.",
      "Fit a splint to the limb and reduce all movement by the victim.",
      "Bring transport to the victim.",
    ],
    [
      "Do not allow victim to move.",
      "Do not attempt to kill the snake.",
      "Do not apply a tourniquet.",
      "Do not cut, suck or wash the bite.",
      "Do not apply chemicals or antiseptics.",
      "Do not give medication or alcohol.",
      "Do not remove bandages.",
      "Do not remove clothing. Bandage over or cut it away.",
    ],
    [
      "Every snake bite requires professional medical evaluation",
      "Victim becomes semi-conscious or is vomiting",
      "Breathing stops — commence CPR",
    ],
    {
      immediatePriority: "Sit or lie the victim down & remain calm. Victim should remain still.",
      essentialActions: [
        "Remove jewellery, bracelet, watch from affected limb.",
        "Apply a SMART (pressure) bandage and mark the bite site on the bandage.",
        "Fit a splint to the limb and reduce all movement by the victim.",
        "Bring transport to the victim.",
      ],
      criticalDonts: [
        "Do not allow victim to move.",
        "Do not apply a tourniquet.",
        "Do not cut, suck or wash the bite.",
        "Do not remove bandages.",
      ],
    },
    makeTreatment(
      "A snake bite can inject venom that may cause serious illness or death. Even a bite that looks minor can be dangerous. The first priorities are to keep the person calm and still, reduce movement of the bitten limb, and get urgent medical care.",
      [
        {
          title: "Keep the person calm and still",
          text: "Help the person sit or lie down and keep them as calm and still as possible. Reassure them.",
          caution: "Try to keep them from walking or moving around more than necessary.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Reduce movement of the bitten limb",
          text: "Keep the bitten arm or leg supported and move it as little as possible.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Remove constricting items near the bite",
          text: "Remove rings, watches, bracelets, or tight clothing near the bite before swelling starts, if they are not stuck to the skin.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Call for urgent medical help",
          text: "Arrange urgent transport to a hospital or medical facility. If possible, call emergency services or have someone else call while you keep the person still.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Monitor for deterioration",
          text: "Watch the person closely for swelling spreading beyond the bite, breathing difficulty, weakness, collapse, or changed consciousness, and tell medical staff what happened.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "snakebite-not-supplied",
          order: 1,
          title: "1 — Not supplied in the reference screenshots",
          instruction: "The supplied screenshots for this guide begin at step 2 (Stop & drop). Step 1 of the reference sequence was not provided, so nothing has been written for this step.",
          explanation: "No wording was supplied for this step, and no first-aid instruction has been invented to fill it.",
          warning: "Do not treat this step as part of the protocol until the missing screenshot is supplied.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "snakebite-stop-drop",
          image: "/images/first-aid/snake-bite/snake-bite-stop-and-drop.jpg",
          imageAlt:
            "Illustration of a snake-bite victim sitting down and staying still while the rescuer calls emergency services at the same time.",
          order: 2,
          title: "2 — Stop & drop",
          instruction: "Sit or lie the victim down & remain calm. Victim should remain still. Call simultaneously.",
          explanation: "Keeping the victim still and calling for help at the same time avoids delay while the bite is being managed.",
          warning: "Do not delay the call. Call emergency services simultaneously while the victim stays still.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "snakebite-remove-jewellery",
          image: "/images/first-aid/snake-bite/snake-bite-remove-jewellery.jpg",
          imageAlt:
            "Illustration of a bandage being applied from the extremity over a bitten limb, with a note to use tension that turns the rectangles on the bandage into squares.",
          order: 3,
          title: "3 — Remove watch, jewellery, rings",
          instruction: "Remove jewellery, bracelet, watch from affected limb. Consider applying gauze dressing to bite site. Start bandage from extremity. Tension to make rectangles on bandage into squares or tension same as sprained ankle.",
          explanation: "Swelling can happen quickly after a snake bite, so items on the affected limb are removed before they become tight.",
          warning: "Reduce tension for people with low muscle mass eg: elderly or children",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "snakebite-pressure-bandage",
          image: "/images/first-aid/snake-bite/snake-bite-pressure-bandage.jpg",
          imageAlt:
            "Illustration of a SMART pressure bandage applied over a bitten forearm with the bite site marked on the bandage, leaving the fingertips visible.",
          order: 4,
          title: "4 — Apply SMART (pressure) bandage",
          instruction: "Mark bite site on bandage.",
          explanation: "Marking the bite site on the bandage shows medical staff where the bite is even after the bandage is applied.",
          warning:
            "Do not remove clothing. Bandage over or cut it away. Leave fingertips/toes visible to monitor circulation",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "snakebite-splint-immobilise",
          image: "/images/first-aid/snake-bite/snake-bite-splint-and-immobilise.jpg",
          imageAlt:
            "Illustration of a survival splint moulded to a bitten limb and fastened with a conforming bandage so that all movement is reduced.",
          order: 5,
          title: "5 — Splint & immobilise",
          instruction: "Fit splint to limb: Use your limb to mould splint into rough shape. Fasten with conforming bandage. Immobilise by bandaging legs together. Place pad between legs with clothing or blanket. Tie legs together using strips of bandage/ narrow triangular bandage through hollows of knees & ankles.",
          explanation: "Splinting and strapping the limb reduces all movement, which limits how quickly venom can spread.",
          warning: "Reduce all movement by victim",
          nextStepCriteria: "The splint is fitted, fastened with a conforming bandage, and the victim is moving as little as possible.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "snakebite-monitor-reassure",
          image: "/images/first-aid/snake-bite/snake-bite-monitor-and-reassure.jpg",
          imageAlt:
            "Illustration of a rescuer reassuring a snake-bite victim lying down with the bandaged limb supported, and monitoring an unconscious victim for breathing.",
          order: 6,
          title: "6 — Monitor & reassure the victim",
          instruction: "Tell the victim that correct first aid measures are in place & that they will be OK. If the victim is semi-conscious or vomiting, gently roll them onto their side (Recovery Position). Monitor unconscious victim & commence CPR if breathing stops.",
          explanation: "Some snake bites can cause rapid deterioration. Reassurance and close monitoring let you act quickly if the victim gets worse.",
          warning: "Monitor unconscious victim & commence CPR if breathing stops.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          followUp: {
            type: "escalate",
            label: "Call emergency services if the victim deteriorates.",
          },
        },
        {
          id: "snakebite-transport",
          image: "/images/first-aid/snake-bite/snake-bite-transport-to-victim.jpg",
          imageAlt:
            "Illustration of an ambulance being brought to a snake-bite victim, with a reminder not to allow the victim to move.",
          order: 7,
          title: "7 — Bring transport to the victim",
          instruction: "Bring transport to the victim.",
          explanation: "Every snake bite needs professional evaluation and, in some cases, antivenom, which can only be given by professionals.",
          warning:
            "Do not allow victim to move. Do not attempt to kill the snake. Do not apply a tourniquet. Do not cut, suck or wash the bite. Do not apply chemicals or antiseptics. Do not give medication or alcohol. Do not remove bandages.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        "Do not allow victim to move.",
        "Do not attempt to kill the snake.",
        "Do not apply a tourniquet.",
        "Do not cut, suck or wash the bite.",
        "Do not apply chemicals or antiseptics.",
        "Do not give medication or alcohol.",
        "Do not remove bandages.",
      ],
      [
        "Every snake bite requires professional medical evaluation",
        "Victim becomes semi-conscious or is vomiting",
        "Breathing stops — commence CPR",
      ],
      false,
      "The core snakebite first aid is the same for all ages: keep the person calm and still, limit movement of the bitten limb, and get urgent medical care. Babies and small children may deteriorate faster, so urgent evaluation is especially important for them.",
    ),
  ),
  "road-accident": makeGuide(
    "road-accident",
    "Road Accident",
    "What to do in a road traffic accident.",
    "/images/road-accident.jpg",
    [
      { title: "Make the scene safe", text: "Ensure the scene is safe before approaching.", appliesTo: ["adult", "teen", "child", "infant"] as const },
      {
        title: "Call for help",
        text: "Call for emergency help and share your exact location.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Do not move casualties",
        text: "Do not move injured people unless there is immediate danger.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Check & treat",
        text: "Check for breathing and severe bleeding, and treat what you can.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Stay until help arrives",
        text: "Keep the person calm and still until help arrives.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
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
    makeTreatment(
      "A road accident can cause injuries ranging from minor to life-threatening. The first priorities are to make sure the scene is safe, call for emergency help, and avoid moving injured people unless there is immediate danger. Then check airway, breathing, and severe bleeding.",
      [
        {
          title: "Make sure the scene is safe first",
          text: "Before you approach, check for traffic, fire, leaking fuel, downed power lines, or other dangers. Do not put yourself in danger.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Call for emergency help",
          text: "Call emergency services or have someone else call, and give the exact location and what you can see.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Do not move injured people unless there is immediate danger",
          text: "If the scene is safe, leave injured people where they are unless they are in immediate danger such as fire or traffic.",
          caution: "Suspected spinal injuries are a key reason to avoid moving the person.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Check responsiveness and breathing",
          text: "Check whether the person is responsive and breathing normally. If they are not responsive or not breathing normally, begin emergency response and CPR if trained.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Control severe bleeding",
          text: "If there is severe bleeding, apply firm direct pressure and keep pressure on the wound.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Keep the person calm and still until help arrives",
          text: "Reassure the person and keep them still and warm while you wait for help.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "road-scene-safe",
          order: 1,
          title: "Make sure the scene is safe",
          instruction: "Before approaching, look for moving traffic, fire, spilled fuel, downed power lines, or other hazards. Do not enter an unsafe scene.",
          explanation: "You cannot help anyone if you become injured yourself. Making the scene safe first protects both you and the injured person. If the scene is unsafe, call for help from a safe place and keep others clear.",
          warning: "Do not rush into traffic or an unsafe environment. If vehicles are still moving, warn other road users and call emergency services.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "road-call-help",
          order: 2,
          title: "Call for emergency help and share your location",
          instruction: "Call emergency services or have someone else call, and tell them the exact location and what you can see.",
          explanation: "Road accidents can cause serious injuries that are not obvious at first. Professional help can assess and treat injuries, and multiple casualties may need coordinated rescue.",
          warning: "Give the location as accurately as you can. If you do not know the exact location, describe the road, landmarks, or direction of travel.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "road-do-not-move",
          order: 3,
          title: "Do not move injured people unless there is immediate danger",
          instruction: "If the scene is safe, leave injured people where they are unless they are in immediate danger such as fire, traffic, or a vehicle about to move.",
          explanation: "Moving an injured person can worsen hidden injuries, especially to the spine or neck. If the person is not in immediate danger, it is usually safer to leave them in place and wait for help.",
          warning: "Do not move a casualty with a suspected spinal injury. Do not try to straighten a deformed limb or push exposed bone back into place.",
          nextStepCriteria: "The person is in a safe place, is being monitored, and help has been called.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "road-check-breathing",
          order: 4,
          title: "Check responsiveness and breathing",
          instruction: "Check whether the person is responsive and breathing normally. If they are not responsive or not breathing normally, begin emergency response and start CPR if you are trained.",
          explanation: "After any crash, the most urgent checks are whether the person is conscious and whether they are breathing. If not, circulation and airway support take priority over everything else.",
          warning: "If the person is unresponsive and not breathing normally, treat it as a life-threatening emergency and call for immediate help. Follow emergency dispatch instructions if you are unsure.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          followUp: {
            type: "escalate",
            label: "Call emergency services immediately if the person is unresponsive or not breathing.",
          },
        },
        {
          id: "road-bleeding",
          order: 5,
          title: "Control severe bleeding",
          instruction: "If there is severe bleeding, apply firm direct pressure over the wound with a clean cloth and keep pressure on it.",
          explanation: "Severe bleeding can be life-threatening. Firm pressure is the priority. If blood soaks through, add more layers on top without removing the first dressing.",
          warning: "Do not remove a soaked dressing. Do not probe the wound. If an object is stuck in the wound, leave it in place and press around it.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "road-stay",
          order: 6,
          title: "Keep the person calm and still until help arrives",
          instruction: "Reassure the person, keep them still and warm, and stay with them until help arrives.",
          explanation: "Calm, still, and warm support helps reduce shock and further injury while waiting for emergency services. Leaving the person alone can be dangerous if their condition changes.",
          warning: "Do not leave the person unattended. Watch for changes in breathing, consciousness, or bleeding.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        "Do not move a casualty with a suspected spinal injury.",
        "Do not remove a motorcycle helmet unless absolutely necessary.",
        "Do not leave the person unattended.",
        "Do not straighten a deformed limb or push exposed bone back into place.",
        "Do not move a seriously injured person unless there is immediate danger.",
      ],
      [
        "Every road accident with injuries",
        "Suspected spinal injury — do not move the casualty",
        "Any head injury or unconsciousness",
        "Severe bleeding that is not controlled",
        "Any person who is unresponsive or not breathing normally",
      ],
      false,
      "The basic sequence for a road accident is the same for all ages: make the scene safe, call for help, avoid moving the person unless necessary, and check airway, breathing, and severe bleeding. Infants and children may deteriorate more quickly, so urgent assessment is important.",
    ),
  ),
  fractures: makeGuide(
    "fractures",
    "Fractures",
    "How to manage fractures and broken bones.",
    "/images/fractures.jpg",
    [
      {
        title: "Keep still & support",
        text: "Keep the injured area still and supported.",
        image: "/images/first-aid/fractures/fractures-make-comfortable.jpg",
        imageAlt:
          "Illustration of a rescuer supporting an injured forearm in a comfortable, still position, with the person kept as comfortable as possible.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Immobilise",
        text: "Immobilize the limb using a splint or sling if trained to do so.",
        image: "/images/first-aid/fractures/fractures-immobilise-with-sling.jpg",
        imageAlt:
          "Illustration of an injured arm supported in an arm sling, keeping the injured limb and the joints above and below it still.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Cold pack",
        text: "Apply a cold pack wrapped in cloth to reduce swelling.",
        appliesTo: ["adult", "teen", "child"] as const,
      },
      {
        title: "Check circulation",
        text: "Check for circulation beyond the injury (colour, warmth, feeling).",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Get medical help",
        text: "Seek medical help for proper diagnosis and treatment.",
        image: "/images/first-aid/fractures/fractures-call-ambulance.jpg",
        imageAlt:
          "Illustration of a rescuer calling emergency services on a phone beside a person with a suspected fracture, with an ambulance arriving.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
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
    makeTreatment(
      "A fracture is a break in a bone. Some fractures are obvious because the limb looks bent or there is bone through the skin; others are less visible. The first priorities are to keep the injured area still and supported, avoid moving it unnecessarily, and get medical help.",
      [
        {
          title: "Keep the injured area still and supported",
          text: "Help the person stop moving the injured part and support it in a comfortable position.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Immobilize the limb if you are trained to do so",
          text: "Use a splint, sling, or other support to keep the injured limb still if you know how to do this safely.",
          caution: "If you are not trained, do not force or realign the limb. Focus on keeping it still and supported.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Apply a cold pack wrapped in cloth",
          text: "If available, apply a cold pack wrapped in a cloth to the injured area to help reduce swelling.",
          caution: "Do not apply ice or a cold pack directly to bare skin.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          title: "Check circulation beyond the injury",
          text: "Check the hand or foot beyond the injury for colour, warmth, and feeling.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Get medical help",
          text: "Seek medical help for a suspected fracture so the injury can be assessed and treated properly.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "fracture-still",
          order: 1,
          title: "Keep the injured area still and supported",
          instruction: "Help the person stop using the injured limb and support it in a comfortable position, using your hand or a soft support if needed.",
          explanation: "Movement can worsen a fracture and increase pain and bleeding. Keeping the injured area still helps reduce further damage and makes the person more comfortable while help is arranged.",
          warning: "Do not try to straighten or realign a bent or deformed limb. Do not force the limb into a normal position.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "fracture-immobilise",
          order: 2,
          title: "Immobilize the limb if you are trained",
          instruction: "If you know how, use a splint, sling, or other support to keep the injured limb and the joints above and below it still.",
          explanation: "Immobilizing the limb helps prevent further movement at the fracture site. A support should be comfortable and should not be so tight that it cuts off circulation.",
          warning: "If you are not trained, focus on gentle support and stillness rather than trying to build a splint that could cause harm. Do not force the limb into position.",
          nextStepCriteria: "The injured limb is supported and as still as possible without causing new pain or circulation problems.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              instruction: "For a baby, support the injured limb gently and keep the child as still and calm as possible.",
              explanation: "Infants cannot follow instructions, so gentle holding and comfort are especially important.",
            },
          ],
        },
        {
          id: "fracture-cold",
          order: 3,
          title: "Apply a cold pack wrapped in cloth",
          instruction: "If available, wrap a cold pack or ice in a cloth and apply it to the injured area to help reduce swelling.",
          explanation: "Cold can help reduce swelling and pain. It should be wrapped and applied for short periods, not placed directly on the skin.",
          warning: "Do not apply ice or a cold pack directly to bare skin. Do not use it if it causes more pain or if the skin is broken in that area.",
          appliesTo: ["adult", "teen", "child"] as const,
          variations: [
            {
              group: "infant",
              instruction: "For a baby, use a cold pack only with care and only if it can be wrapped and applied gently; avoid prolonged contact.",
              explanation: "Babies have sensitive skin, so cold should be used cautiously and for short periods.",
            },
          ],
        },
        {
          id: "fracture-circulation",
          order: 4,
          title: "Check circulation beyond the injury",
          instruction: "Check the hand or foot beyond the injury for colour, warmth, and feeling.",
          explanation: "A fracture or tight support can sometimes affect blood flow or nerve function beyond the injury. Checking colour, warmth, and feeling helps you notice a problem early.",
          warning: "If the area beyond the injury becomes pale, cold, numb, tingly, or blue, the support may be too tight or the injury may be affecting circulation. Seek medical help and loosen any support if needed.",
          nextStepCriteria: "The hand or foot beyond the injury stays pink, warm, and normally sensitive.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "fracture-open",
          image: "/images/first-aid/fractures/fractures-check-for-wounds.jpg",
          imageAlt:
            "Illustration of a rescuer checking an injured limb for wounds, deformity, or exposed bone, while leaving the limb still and supported.",
          order: 5,
          title: "Recognise serious fracture signs and get urgent help",
          instruction: "If you see a visible deformity, bone through the skin, no circulation beyond the injury, severe pain, or the injury followed a serious accident, get urgent medical help.",
          explanation: "Some fractures are more serious and need urgent care. An open fracture, where bone is visible through the skin, carries a high risk of infection and needs immediate medical attention.",
          warning: "Do not push exposed bone back into place. Do not probe the wound. Cover it loosely with a clean, dry dressing if you can, without pressing on the bone.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          followUp: {
            type: "escalate",
            label: "Get urgent medical help for a serious or open fracture.",
          },
        },
        {
          id: "fracture-nothing-by-mouth",
          order: 6,
          title: "Do not give food or drink in case surgery is needed",
          instruction: "Do not give the person anything to eat or drink until a medical professional says it is safe.",
          explanation: "A fracture may need surgery or other treatment that is safer on an empty stomach. Waiting for medical advice reduces the chance of delays or complications.",
          warning: "Do not give food or drink. Small sips to relieve thirst may seem kind, but they can complicate possible surgery.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        "Do not try to straighten or realign the bone.",
        "Do not move the person unnecessarily.",
        "Do not let the person eat or drink in case surgery is needed.",
        "Do not apply ice or a cold pack directly to bare skin.",
      ],
      [
        "Suspected fracture always requires medical care",
        "Visible deformity or bone through skin",
        "No circulation beyond the injury",
        "Severe pain or inability to use the limb",
        "A fracture after a serious accident or fall",
      ],
      false,
      "The basic fracture first aid is similar for all ages: keep the injured part still and supported, avoid moving it unnecessarily, and get medical help. Babies and small children may not be able to describe pain or use the limb normally, so any suspected fracture in an infant or child should be assessed promptly.",
    ),
  ),
  cpr: makeGuide(
    "cpr",
    "CPR and Unresponsiveness",
    "Steps for a person who is unresponsive or not breathing normally.",
    "/images/cpr.jpg",
    [
      {
        title: "Check responsiveness",
        text: "Check if the person responds by shaking their shoulders and shouting.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Call for emergency help",
        text: "Shout for help and call emergency services, or have someone else call now.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Open airway",
        text: "Open the airway by tilting the head back and lifting the chin.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Check breathing",
        text: "Check for normal breathing for up to 10 seconds.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Start chest compressions",
        text: "If not breathing normally, start chest compressions right away.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
      {
        title: "Continue until help arrives",
        text: "Keep going with compressions and rescue breaths until help takes over.",
        appliesTo: ["adult", "teen", "child", "infant"] as const,
      },
    ],
    [
      "Check if the person is responsive and breathing.",
      "Call emergency services immediately.",
      "Start chest compressions if they are not breathing normally.",
    ],
    [
      "Do not leave the person alone.",
      "Do not stop compressions except to give breaths or when help takes over.",
      "Do not assume breathing has returned because the person moves.",
    ],
    [
      "The person is unresponsive",
      "The person is not breathing normally",
      "The person is only gasping",
    ],
    {
      immediatePriority: "Call for help and start compressions if the person is not breathing normally.",
      essentialActions: [
        "Check if the person responds and is breathing.",
        "Call emergency services or shout for help.",
        "Open the airway and check breathing.",
        "Start chest compressions if not breathing normally.",
        "Continue until help arrives.",
      ],
      criticalDonts: [
        "Do not leave the person alone.",
        "Do not delay compressions to search for a pulse.",
        "Do not stop unless help takes over or the person starts breathing normally.",
      ],
    },
    makeTreatment(
      "CPR is for someone who is unresponsive and not breathing normally. The immediate priorities are to call for emergency help and start chest compressions as soon as possible. When rescue breaths are possible, combine them with compressions. For infants and children, causes are often respiratory, so rescue breaths matter more than for adults.",
      [
        {
          title: "Check responsiveness",
          text: "Check if the person responds by gently shaking their shoulders and shouting. If there is no response, treat as an emergency.",
          caution: "Handle the person carefully and keep them still.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Call for emergency help",
          text: "Shout for help. If someone is nearby, send them to call emergency services and bring an AED if one is available. If you are alone, call now.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Open the airway",
          text: "Tilt the head back and lift the chin to open the airway.",
          appliesTo: ["adult", "teen", "child"] as const,
        },
        {
          title: "Check breathing",
          text: "Look, listen, and feel for normal breathing for no more than 10 seconds. Noisy breathing or occasional gasps is not normal breathing.",
          caution: "Do not confuse gasping with normal breathing.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Start chest compressions",
          text: "If the person is not breathing normally, start chest compressions immediately.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          title: "Give rescue breaths if you can",
          text: "After 30 compressions, give 2 rescue breaths if you are trained and willing. Keep going with 30 compressions and 2 breaths.",
          caution: "If you cannot or will not give breaths, keep doing compressions without stopping.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
      ],
      [
        {
          id: "cpr-check-responsive",
          image: "/images/first-aid/cpr/cpr-adult-check-response.jpg",
          imageAlt:
            "Illustration of a rescuer kneeling beside an unresponsive adult and shaking the shoulders while shouting to check for a response.",
          order: 1,
          title: "Check for responsiveness",
          instruction: "Shake the person’s shoulders and shout to see if they respond. If there is no response, move on immediately.",
          explanation: "An unresponsive person may be in cardiac arrest or another life-threatening state. Quick recognition matters more than a detailed assessment.",
          warning: "Do not waste time. If there is no response, start the emergency response now.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              image: "/images/first-aid/cpr/cpr-baby-check-response.jpg",
              imageAlt:
                "Illustration of a rescuer tapping the sole of a baby's foot to check whether the infant responds.",
              instruction: "For a baby, tap the sole of the foot or gently flick the foot and shout to check responsiveness.",
              explanation: "Infants can be assessed with a gentle foot tap rather than a shoulder shake.",
            },
            {
              group: "child",
              image: "/images/first-aid/cpr/cpr-child-check-response.jpg",
              imageAlt:
                "Illustration of a rescuer gently shaking a child's shoulders and shouting to check whether the child responds.",
            },
          ],
        },
        {
          id: "cpr-call-help",
          order: 2,
          title: "Call for emergency help and get an AED if possible",
          instruction: "Shout for help. If someone is nearby, send them to call emergency services and bring an AED. If you are alone, call now and put the phone on speaker if you can.",
          explanation: "Survival is better when help arrives quickly and defibrillation is available. Getting help early is a top priority.",
          warning: "Do not leave the person alone except to call for help or get an AED quickly.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "cpr-open-airway",
          image: "/images/first-aid/cpr/cpr-adult-open-airway.jpg",
          imageAlt:
            "Illustration of a rescuer tilting an adult's head back and lifting the chin to open the airway before checking breathing.",
          order: 3,
          title: "Open the airway",
          instruction: "Tilt the head back and lift the chin to open the airway.",
          explanation: "An open airway helps air reach the lungs if breathing is present or if you give rescue breaths.",
          warning: "If you suspect a neck injury, still open the airway but use a minimal head tilt and jaw thrust if you know how.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              image: "/images/first-aid/cpr/cpr-baby-open-airway.jpg",
              imageAlt:
                "Illustration of a rescuer keeping a baby's head in a neutral position and lifting the chin to open the airway without over-tilting the head.",
              instruction: "For a baby, keep the head in a neutral position and lift the chin without over-tilting the head.",
              explanation: "Babies have a larger head relative to the body, so a neutral head position usually opens the airway best.",
            },
            {
              group: "child",
              image: "/images/first-aid/cpr/cpr-child-open-airway.jpg",
              imageAlt:
                "Illustration of a rescuer tilting a child's head back and lifting the chin to open the airway.",
            },
          ],
        },
        {
          id: "cpr-check-breathing",
          order: 4,
          title: "Check for normal breathing",
          instruction: "Look, listen, and feel for normal breathing for no more than 10 seconds. Occasional gasps are not normal breathing.",
          explanation: "Breathing may be absent or abnormal in cardiac arrest. Gasping is not a reliable sign that breathing is adequate.",
          warning: "Do not spend more than 10 seconds checking. If you are unsure, treat as not breathing normally.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
        },
        {
          id: "cpr-compressions-adult",
          image: "/images/first-aid/cpr/cpr-adult-start-cpr-hand-placement.jpg",
          imageAlt:
            "Illustration of hand placement for adult chest compressions, with the heel of one hand in the centre of the chest and the other hand on top with fingers interlocked.",
          order: 5,
          title: "Start chest compressions",
          instruction: "Place the heel of one hand in the centre of the chest, place the other hand on top, interlock fingers, and press down hard and fast. Aim for a depth of about 5 to 6 cm at a rate of 100 to 120 compressions per minute.",
          explanation: "Chest compressions keep blood moving to the brain and heart until help arrives. Quality compressions matter more than perfection.",
          warning: "Do not stop compressions except to give breaths, use an AED, or when help takes over. Allow the chest to recoil fully between compressions.",
          appliesTo: ["adult", "teen"] as const,
        },
        {
          id: "cpr-compressions-child",
          image: "/images/first-aid/cpr/cpr-child-chest-compressions.jpg",
          imageAlt:
            "Illustration of chest compressions on a child using one or two hands as needed for the child's size, compressing about one third of the chest depth.",
          order: 6,
          title: "Chest compressions for a child",
          instruction: "Use one hand or two hands as needed for the child’s size. Compress the chest by about one third of its depth, at a rate of 100 to 120 per minute.",
          explanation: "Children usually need a depth of about one third of the chest depth rather than the adult measure.",
          warning: "Do not use adult depth targets for a small child. Keep the rate fast and the compressions effective.",
          appliesTo: ["child", "teen", "infant"] as const,
          variations: [
            {
              group: "infant",
              image: "/images/first-aid/cpr/cpr-baby-chest-compressions.jpg",
              imageAlt:
                "Illustration of chest compressions on a baby using two fingers in the centre of the chest, compressing about 4 cm at 100 to 120 per minute.",
              instruction: "For a baby, use two fingers in the centre of the chest and compress about 4 cm, or use the encircling hands technique if preferred. Keep the rate at 100 to 120 per minute.",
              explanation: "Two fingers are often practical for a single rescuer on an infant. The depth target is about 4 cm.",
            },
          ],
        },
        {
          id: "cpr-rescue-breaths",
          image: "/images/first-aid/cpr/cpr-adult-rescue-breaths.jpg",
          imageAlt:
            "Illustration of two rescue breaths being given to an adult, with the nose pinched and the chest rising after each breath.",
          order: 7,
          title: "Give rescue breaths if you can",
          instruction: "After 30 compressions, pinch the nose, seal your mouth over the person’s mouth, and give 2 breaths, each over about 1 second, enough to make the chest rise.",
          explanation: "Rescue breaths add oxygen. For infants and children, breaths are especially important because arrest is often respiratory in origin.",
          warning: "If the chest does not rise, reposition the airway and try again. If you cannot give breaths, keep doing compressions.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              image: "/images/first-aid/cpr/cpr-baby-rescue-breaths.jpg",
              imageAlt:
                "Illustration of gentle rescue breaths being given to a baby with the rescuer's mouth over both the mouth and nose until the chest rises.",
              instruction: "For a baby, place your mouth over both the mouth and nose and give gentle puffs that make the chest rise.",
              explanation: "Infants need smaller breaths than adults; each breath should be just enough to see the chest rise.",
            },
            {
              group: "child",
              image: "/images/first-aid/cpr/cpr-child-rescue-breaths.jpg",
              imageAlt:
                "Illustration of a rescue breath being given to a child with the nose pinched and the chest rising.",
            },
          ],
        },
        {
          id: "cpr-continue",
          image: "/images/first-aid/cpr/cpr-adult-continue-cpr.jpg",
          imageAlt:
            "Illustration of continuous CPR cycles of 30 compressions and 2 breaths being carried on until emergency services take over.",
          order: 8,
          title: "Continue until help arrives",
          instruction: "Keep going with cycles of 30 compressions and 2 breaths, or continuous compressions if you are not giving breaths. Use an AED as soon as it arrives and follow its prompts.",
          explanation: "Resuscitation is hard work. Keep going until emergency services take over, an AED is ready to analyse, or the person starts breathing normally and responds.",
          warning: "Do not stop compressions for long periods. Use the AED as soon as it is available.",
          appliesTo: ["adult", "teen", "child", "infant"] as const,
          variations: [
            {
              group: "infant",
              image: "/images/first-aid/cpr/cpr-baby-continue-cpr.jpg",
              imageAlt:
                "Illustration of cycles of chest compressions and rescue breaths continuing on a baby until emergency services take over.",
            },
            {
              group: "child",
              image: "/images/first-aid/cpr/cpr-child-continue-cpr.jpg",
              imageAlt:
                "Illustration of cycles of chest compressions and rescue breaths continuing on a child until emergency services take over.",
            },
          ],
          followUp: {
            type: "escalate",
            label: "Continue CPR until emergency services take over.",
          },
        },
      ],
      [
        "Do not leave the person alone.",
        "Do not stop compressions except to give breaths or when help takes over.",
        "Do not assume breathing has returned because the person moves.",
        "Do not delay CPR to search for a pulse if you are not sure.",
      ],
      [
        "The person is unresponsive",
        "The person is not breathing normally",
        "The person is only gasping",
        "No pulse is confidently felt within 10 seconds",
      ],
      true,
      "CPR technique differs by age. Infant compressions are shallower and usually use two fingers; children often use one or two hands depending on size; adults usually use two hands. Rescue breaths are especially important for infants and children. All ages need emergency help and early defibrillation if available.",
    ),
  ),
};

export const GUIDE_LIST: FirstAidGuide[] = Object.values(FIRST_AID_GUIDES);

/**
 * Categories the admin editor and CMS currently have a bundled baseline for.
 * Extended alongside `FIRST_AID_GUIDES` so the admin editor, overview page,
 * and media usage index remain category-complete without depending on the data
 * module's internal shape by name.
 */
export const EDITOR_CATEGORIES: readonly FirstAidGuide[] = Object.values(
  FIRST_AID_GUIDES,
);

/** Step draft representation reused by the admin editor draft layer. */
export type StepDraft = {
  readonly title: string;
  readonly text: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly warning: string;
};

/**
 * Version of the bundled first-aid content package. All bundled guides share
 * this version while content is served from the static dataset; the offline
 * package records which version was downloaded so the UI can honestly flag
 * "update available".
 */
export const CONTENT_VERSION = "0.1.0-unreviewed";
