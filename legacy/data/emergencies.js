/* ==========================================================================
   Lifeguard360 — data/emergencies.js
   Static content for the six core emergency categories. Exposed as a
   global `EmergencyData` object so any page can read it without a build
   step. Medical wording here is placeholder content for the frontend
   scaffold — the brief calls for it to be reviewed against a proper
   first-aid source before this becomes final (see project brief, §4).
   ========================================================================== */

const EmergencyData = {
  burns: {
    id: "burns",
    label: "Burns",
    summary: "Learn what to do in case of burns and scalds.",
    iconClass: "icon-burns",
    videoSrc: "../videos/burns/burns-first-aid.mp4",
    steps: [
      "Move the person away from the heat source.",
      "Cool the burn under cool running water for 10–20 minutes.",
      "Remove tight items (rings, watches) near the burn before it swells.",
      "Cover loosely with a clean, non-fluffy cloth or dressing.",
      "Seek medical help for large, deep, or facial/hand burns.",
    ],
    dos: [
      "Cool the burn with cool (not ice-cold) running water.",
      "Cover with a clean, non-stick dressing.",
      "Keep the person warm and calm.",
    ],
    donts: [
      "Do not apply ice, butter, or ointments to the burn.",
      "Do not burst any blisters.",
      "Do not remove clothing stuck to the burn.",
    ],
  },

  bleeding: {
    id: "bleeding",
    label: "Bleeding",
    summary: "Learn how to control bleeding in an emergency.",
    iconClass: "icon-bleeding",
    videoSrc: "../videos/bleeding/bleeding-first-aid.mp4",
    steps: [
      "Apply firm, direct pressure to the wound with a clean cloth.",
      "Keep the pressure steady and raise the injured area if possible.",
      "Add more cloth on top if blood soaks through — do not remove the first layer.",
      "Bandage firmly once bleeding slows.",
      "Seek medical help for deep, spurting, or uncontrolled bleeding.",
    ],
    dos: [
      "Apply firm, direct pressure.",
      "Keep the injured area raised above the heart if possible.",
      "Reassure and keep the person still.",
    ],
    donts: [
      "Do not remove an embedded object from the wound.",
      "Do not remove a soaked dressing — add more on top instead.",
      "Do not use a tourniquet unless trained and bleeding is life-threatening.",
    ],
  },

  choking: {
    id: "choking",
    label: "Choking",
    summary: "Steps to help someone who is choking.",
    iconClass: "icon-choking",
    videoSrc: "../videos/choking/choking-first-aid.mp4",
    steps: [
      "Ask the person if they are choking — if they can cough or speak, encourage coughing.",
      "If they cannot breathe, cough, or speak, give up to 5 back blows between the shoulder blades.",
      "If that fails, give up to 5 abdominal thrusts (Heimlich manoeuvre).",
      "Repeat the cycle of back blows and abdominal thrusts.",
      "Call for emergency medical help immediately if the airway stays blocked.",
    ],
    dos: [
      "Encourage the person to keep coughing if they still can.",
      "Give firm back blows between the shoulder blades.",
      "Call for emergency help if the blockage does not clear.",
    ],
    donts: [
      "Do not perform abdominal thrusts on infants — use back blows and chest thrusts instead.",
      "Do not reach into the mouth blindly to try to remove the object.",
      "Do not leave the person alone.",
    ],
  },

  "snake-bite": {
    id: "snake-bite",
    label: "Snake Bite",
    summary: "First aid for snake bite victims.",
    iconClass: "icon-snake-bite",
    videoSrc: "../videos/snake-bite/snake-bite-first-aid.mp4",
    steps: [
      "Keep the victim calm and still.",
      "Immobilize the affected limb.",
      "Remove rings, watches or tight clothing near the bite.",
      "Do not cut the wound or try to suck out the venom.",
      "Seek medical help immediately.",
    ],
    dos: ["Keep the victim still.", "Seek professional medical care immediately."],
    donts: [
      "Do not cut the bite.",
      "Do not suck out the venom.",
      "Do not apply harmful substances or a tight tourniquet.",
    ],
  },

  "road-accident": {
    id: "road-accident",
    label: "Road Accident",
    summary: "What to do in a road traffic accident.",
    iconClass: "icon-road-accident",
    videoSrc: "../videos/road-accident/road-accident-first-aid.mp4",
    steps: [
      "Ensure the scene is safe before approaching.",
      "Call for emergency help and share your exact location.",
      "Do not move injured people unless there is immediate danger.",
      "Check for breathing and severe bleeding, and treat what you can.",
      "Keep the person calm and still until help arrives.",
    ],
    dos: [
      "Check the scene is safe before helping.",
      "Call for emergency help right away.",
      "Keep injured people still and calm.",
    ],
    donts: [
      "Do not move a casualty with a suspected spinal injury.",
      "Do not remove a motorcycle helmet unless absolutely necessary.",
      "Do not leave the person unattended.",
    ],
  },

  fractures: {
    id: "fractures",
    label: "Fractures",
    summary: "How to manage fractures and broken bones.",
    iconClass: "icon-fractures",
    videoSrc: "../videos/fractures/fractures-first-aid.mp4",
    steps: [
      "Keep the injured area still and supported.",
      "Immobilize the limb using a splint or sling if trained to do so.",
      "Apply a cold pack wrapped in cloth to reduce swelling.",
      "Check for circulation beyond the injury (colour, warmth, feeling).",
      "Seek medical help for proper diagnosis and treatment.",
    ],
    dos: [
      "Keep the injured area supported and still.",
      "Apply a wrapped cold pack to reduce swelling.",
      "Get medical attention for an X-ray and proper care.",
    ],
    donts: [
      "Do not try to straighten or realign the bone.",
      "Do not move the person unnecessarily.",
      "Do not let the person eat or drink in case surgery is needed.",
    ],
  },
};
