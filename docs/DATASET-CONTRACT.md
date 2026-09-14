# Lifeguard360 — Facility Dataset Contract

**Status:** v1.0 · 2026-09-14 · governs the Firestore `facilities` collection
**Enforcement:** `tools/seedFacilities.ts` is the ONLY sanctioned write path. Firestore rules
allow public read and **no client writes** (`firebase/firestore.rules` → `facilities` block);
Admin-SDK writes bypass rules by design, so this contract and its seeder are the integrity layer.

**Example file:** `tools/facilities.example.json` is **EXAMPLE ONLY — NOT PRODUCTION DATA**.
It demonstrates the schema with fictional records and must never be imported as real data.

---

## 1. Document shape

Collection: `facilities/{facilityId}` — consumed by
`src/services/facilities/facilityService.ts` (`listVerifiedFacilities` / `findNearbyFacilities`).

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✔ | Facility identity as publicly displayed |
| `category` | string | ✔ | See §6 taxonomy |
| `coordinates.latitude` | number | ✔ | −90 ≤ value ≤ 90, never part of `0,0` |
| `coordinates.longitude` | number | ✔ | −180 ≤ value ≤ 180, never part of `0,0` |
| `verified` | boolean | ✔ | See §3 |
| `source` | string | ✔ for `verified: true` | See §5 |
| `updatedAt` | string | ✔ | ISO 8601 timestamp of last verification/update, e.g. `2026-09-14T10:00:00Z` |
| `phone` | string | optional | E.164-style: begins `+`, digits only after, e.g. `+2348012345678` |
| `openingHours` | string | optional | Free text as published by the facility, e.g. `24/7` |

The client maps defensively (missing `name` → "Unnamed facility", etc.), but records relying on
those fallbacks are **not** valid under this contract and are rejected by the seeder.
Unverified records (`verified: false`) must still carry `source` (see §5) so they are promotable.

## 2. Coordinates

- Bounds enforced: latitude ∈ [−90, 90]; longitude ∈ [−180, 180]; both finite numbers.
- `(0, 0)` is rejected outright — it is the "no data" sentinel and would place a record in the
  Gulf of Guinea. Records at `0,0` are also invisible to nearby search by client-side filter.
- Coordinates must be the **actual facility location**, captured from an authoritative or
  confirmable source. Approximate, guessed, or random coordinates are not acceptable and are
  rejected at import.

## 3. Verification semantics

`verified: true` means: the dataset curator has confirmed the facility's **identity, name,
category, physical location, coordinates, source/provenance, and — when available — phone and
opening hours**, i.e. the record has passed the project's data-verification process.

`verified: true` does **NOT** mean medically certified, endorsed, or quality-assured by
Lifeguard360. It is a data-provenance claim, never a clinical one. UI copy must not imply otherwise.

Only `verified: true` records are exposed by the public service
(`listVerifiedFacilities()` filters on `verified === true`).

## 4. Phone

- If supplied: must match `^\+[0-9]{8,15}$` (E.164-style; Nigerian example `+2348012345678`).
- Never invent, normalize, or guess an unverified number merely to satisfy validation. If the
  number is not confirmed, omit the field entirely.

## 5. Source / provenance

Every record must state where its information came from. The `source` string must identify:

- **source name** (required)
- **reference/URL** where applicable (required when the source has one)
- **verification date** (required for `verified: true`)
- **relevant notes** where necessary

written compactly and human-readably, e.g.:

```
"Official hospital website (example.org), verified 2026-09-10"
"Facility registry listing (registry.example.gov), verified 2026-08-30; phone confirmed by call"
```

A verified record whose provenance cannot be stated this way must not be marked verified.
Do not invent URLs or sources. Unverified records carry whatever partial provenance exists —
never a fabricated citation.

## 6. Categories

The application treats `category` as an open string (no closed enum exists in code). Use the
de-facto dataset convention consistently: `hospital`, `clinic`, `pharmacy`, `health-centre`.
Lowercase, hyphenated. The seeder warns (but does not fail) on values outside this list so the
taxonomy does not silently drift. Do not introduce a conflicting taxonomy.

## 7. Deterministic IDs (deduplication)

Document ID = `facility-` + slugified **name** + rounded **coordinates**, using only fields
already present in the approved facility schema (no ID-helper field is introduced):

```
id = "facility-" + slug(name) + "-" + coord(latitude) + "-" + coord(longitude)
coord(v) = ("n" if v < 0 else "p") + |v| rounded to 4 decimals, dot → dash
```

- **Why name + coordinates:** a facility's identity is *what it is called* and *where it
  physically is* — both already required by §1/§2. No new data-model field is created just to
  build IDs.
- **4-decimal rounding (~11 m):** facility-placement precision; keeps IDs stable when a
  re-import re-states the same place with a few more/fewer decimals, while distinct branches
  of a same-named facility chain still get distinct IDs.
- **Sign safety:** the `p`/`n` prefix prevents +9.2345 / −9.2345 collisions.
- Normalization (`slug`): lowercase; trim; ASCII-fold diacritics; drop apostrophes
  ("Luke's" → "lukes"); collapse every other non-alphanumeric run to a single `-`; trim `-`.
- Deterministic → stable between imports → repeated runs **update in place** via Firestore
  `set()` (idempotent) instead of creating duplicates.
- Two genuinely different facilities are never silently merged: a different name or a
  materially different position produces a different ID. A same-name same-position collision
  is a true duplicate the curator resolves deliberately — the tooling never auto-merges.
- The seeder fails the run on duplicate IDs *within* one input file.
- Never use random/auto IDs for this collection.

## 8. Import rules (enforced by `tools/seedFacilities.ts`)

1. Input: `--file <path>` JSON of the form `{ "meta": {...}, "facilities": [ ... ] }`.
2. Validation is all-or-nothing: **any** failing record aborts the run; nothing is written.
3. Default mode is **dry-run** — full validation + summary with zero Firestore calls.
   Writing requires the explicit `--write` flag.
4. Writes use deterministic `set()` on `facility-<slug>` IDs — idempotent re-imports.
5. The script never generates missing data (names, phones, coordinates, sources) and never
   upgrades `verified` on its own; malformed records are refused, never silently corrected.
6. A dataset-level provenance note (curator, date, overall source) is required in the input
   file's `meta` block.
