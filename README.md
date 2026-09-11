# Lifeguard360

**A Web-Based Emergency Response and First Aid Assistance System** — an individual-user,
web-based first-aid guidance and emergency-assistance platform for the Nigerian context.

> **Scope note.** Lifeguard360 is _not_ an ambulance-dispatch platform and contains no
> responder, dispatcher, assignment, or tracking architecture. When an emergency happens, the
> system informs the user, helps the user reach **their own trusted contacts and nearby
> verified facilities using their own device**, and stays truthful about what it did and did
> not do.

---

## Features

| Feature                                                                               | Status                                                               |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Six first-aid guides (Burns, Bleeding, Choking, Snake Bite, Road Accident, Fractures) | Implemented (content pending clinical review — see below)            |
| Step-by-step instructions, dos/don'ts, seek-help guidance                             | Implemented                                                          |
| Educational videos                                                                    | Designed (Storage paths reserved; no videos published yet)           |
| Text-to-speech voice assistance (Web Speech API)                                      | Implemented; degrades gracefully when unsupported                    |
| Guest access to all first-aid content                                                 | Implemented                                                          |
| Registered accounts (Firebase Authentication)                                         | Implemented                                                          |
| Emergency contacts CRUD (E.164 Nigerian phone normalisation)                          | Implemented                                                          |
| Get Help Now: device call, prepared SMS, one-shot location sharing                    | Implemented                                                          |
| Find Nearby Healthcare Facilities (provider-agnostic `FacilitySearchService`)         | Implemented against Firestore; **no verified dataset published yet** |
| Offline first-aid package (registered users)                                          | Implemented (localStorage; version-aware update indicator)           |
| Activity History (meaningful events only, data minimisation)                          | Implemented                                                          |
| Firestore security rules (CIA-triad based)                                            | Implemented in `firebase/firestore.rules`                            |
| Human-reviewed translations (Hausa, Yoruba, Igbo, Pidgin)                             | Designed — dictionaries empty until reviewed                         |
| Facility dataset, Google Maps embedding, App Check, push notifications                | Not implemented (future work)                                        |

## Truthfulness contract

The UI never claims more than happened:

- **Prepared ≠ Sent ≠ Delivered.** The app prepares an SMS and opens your messaging app; it
  cannot know whether you sent it and never claims delivery.
- Location is acquired **one-shot on explicit user action only** — never automatically, never
  continuously, never in the background.
- Offline access covers **first-aid content only**, never communications.
- Facility search shows honest empty states; fabricated facility data is forbidden.
- First-aid content carries provenance metadata; nothing is presented as clinically approved
  until reviewed against a verified source (St John Ambulance / WHO / Nigerian Red Cross).

## Tech stack

React 19 + TypeScript 5.9 + Vite 8 · React Router 8 · Firebase 12 (Auth, Firestore, Storage,
Hosting) · CSS Modules + design tokens (no Tailwind) · Zod · Vitest + React Testing Library ·
Playwright · ESLint + Prettier.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config values
npm run dev
```

The Firebase web config values are public identifiers, not secrets — data protection is
enforced by Firestore Security Rules, never client-side secrecy.

### Scripts

| Command                           | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `npm run dev`                     | Vite dev server                           |
| `npm run build`                   | Type-check + production build             |
| `npm run preview`                 | Serve the production build locally        |
| `npm test`                        | Vitest unit/component tests               |
| `npm run test:e2e`                | Playwright end-to-end tests               |
| `npm run lint` / `npm run format` | ESLint / Prettier                         |
| `npm run typecheck`               | `tsc -b`                                  |
| `npm run emulators:start`         | Firebase Auth/Firestore/Storage emulators |
| `npm run deploy:rules`            | Deploy Firestore + Storage rules          |

## Project structure

```
├── firebase/            # Firestore/Storage security rules + indexes
├── legacy/              # Frozen vanilla prototype (reference only, not built)
├── src/
│   ├── app/             # Router, providers, navigation config
│   ├── components/      # Design-system primitives (Button, Card, Field, icons)
│   ├── data/            # Versioned first-aid content (provenance-carrying)
│   ├── hooks/           # useGeolocation (one-shot), useSpeech, useOnlineStatus
│   ├── layouts/         # AppLayout shell (sidebar / topbar / bottom nav)
│   ├── pages/           # Route-level compositions (CSS Modules beside each)
│   ├── services/        # The only code that touches SDKs (firebase, auth,
│   │                    #   contacts, activity, facilities, location,
│   │                    #   communication, offline, i18n, firstAid)
│   ├── styles/          # Design tokens + global shell styles
│   ├── types/           # Domain model (mirrored by security rules)
│   └── utils/           # format/geometry + phone normalisation
└── e2e/                 # Playwright specs (320/360/390/430/desktop viewports)
```

## Security architecture

- **Firestore rules are the only enforcement layer** (`firebase/firestore.rules`); the client
  is never trusted for authorization.
- `users/{uid}` — owner-only. Contacts and activity are owner-only subcollections.
- Activity is **append-only** (create + read; no update, no delete) — an audit trail.
- Strict field allow-lists; clients cannot write server timestamps or unknown fields.
- Phones must match `^\+234[0-9]{10}$`; relationships are a closed enum.
- Guides, facilities, and config are public-read and **client-unwritable**; content and
  facility data enter only through controlled pipelines.
- Default-deny catch-all for everything else.

## Testing

- 38 Vitest unit/component tests: formatting/geometry, phone normalisation, the communication
  truthfulness contract, offline package + provider, six-category completeness, guide
  rendering, honest not-found and disclaimer behaviour.
- Playwright is configured (with the mobile viewport matrix); run `npx playwright install`
  once, then `npm run test:e2e`.
- Firebase Emulator Suite is wired for rules testing (`npm run emulators:start`).

## Known limitations

- First-aid content is prototype wording pending review against a verified source; the
  dataset carries `0.1.0-unreviewed` and per-claim provenance placeholders until then.
- No verified facility dataset exists yet; discovery shows an honest empty state until data
  is loaded through the preparation pipeline (Overpass is permitted for dev/prep only).
- The bundle is large because the Firebase SDK is imported statically; code-splitting is
  future work.
- SMS/call actions depend entirely on the user's device, SIM, coverage and airtime.
