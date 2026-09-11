# Lifeguard360 — Frontend Foundation (Stage 1)

This is the **Stage 1** deliverable per the project brief: the desktop
frontend shell and dashboard, built with plain HTML5, CSS3, and
JavaScript ES6+ — no Bootstrap, no framework.

## What's here

```
index.html                 Desktop dashboard (home screen)
css/
  base.css                 Design tokens, reset, base typography
  layout.css               App shell: sidebar, topbar, content grid
  components.css           Buttons, cards, badges, hero, emergency cards, etc.
  responsive.css           Tablet/mobile stacking + off-canvas sidebar + bottom nav
  pages/dashboard.css      Dashboard-only layout rules
js/
  utils.js                 Small shared helpers (qs/qsa, formatting, query params)
  app.js                   Mobile sidebar open/close behaviour
data/
  emergencies.js           Content for the six emergency categories (steps/do's/don'ts),
                            ready for the First Aid Guide pages in Stage 3–4
pages/, videos/, assets/, firebase/   Empty folders matching the brief's
                            architecture, ready for later stages
```

## Design decisions carried over from the brief

- **Colours:** white/light surfaces, dark navy sidebar, red for emergency
  actions, green for location/hospital actions, blue for informational
  elements — matching §8 of the brief and the reference screenshots.
- **Typography:** Manrope for headings (bold, confident, good at large
  sizes for emergency headlines), Inter for body/UI text (very legible
  at small sizes, which matters for a stressed user reading fast).
- **Sidebar sections** mirror the brief's §6: Home, First Aid Guide,
  Emergency Alert, Hospitals Nearby, My Contacts, Alert History, Settings.
- Only the **Home** dashboard is wired up with real content in this
  pass. The other sidebar links point to `pages/*.html`, which don't
  exist yet — that's Stage 3 onward.

## Things to flag before you move on

1. **Hero photo is missing.** `components.css` references
   `assets/images/hero-first-aid.jpg` (a photo of someone giving first
   aid, like the reference image). I didn't add a stock photo since I
   can't source one for you — drop a real photo in at that path, or
   tell me and I can adjust the hero to not depend on one.
2. **Mobile is a responsive _compression_ of the desktop dashboard for
   now** (stacked cards, off-canvas sidebar, bottom nav) — this gets
   the shell usable on a phone, but the brief is explicit that the
   real mobile experience should be **emergency-first**, structured
   like the six mobile reference screens (large "Get Help Now",
   emergency cards, then First Aid / Emergency / Hospitals / Contacts).
   That's Stage 2 and will likely mean a distinct mobile template
   rather than just breakpoint overrides.
3. **`data/emergencies.js`** has placeholder first-aid steps/Do's/Don'ts
   for all six categories so the First Aid Guide pages have real
   content to render once built — the brief flags this content needs
   review against a proper first-aid source before it's final (§4).
4. Nothing here talks to Firebase, Leaflet, or the Overpass API yet —
   per the brief, that's Stages 5–7.

## Suggested next step

Stage 2 (dedicated mobile-first templates) or Stage 3 (the six
emergency category pages, wired to `data/emergencies.js`) — whichever
you want to tackle first.
