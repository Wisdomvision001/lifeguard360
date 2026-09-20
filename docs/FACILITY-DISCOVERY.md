# Lifeguard360 — Facility Discovery (Overpass/OSM, Preparation Tooling)

> **Overpass/OpenStreetMap is a discovery source, not an authoritative verification
> source. A discovered facility must never automatically become `verified: true`.**

## 1. Purpose

`tools/facilityDiscovery/` discovers candidate healthcare facilities from
OpenStreetMap via the Overpass API so a human can review, verify, and deliberately
promote them into the curated dataset (`tools/facilities.*.json`). The public
application never talks to Overpass; its runtime facility search continues to read
**verified facilities from Firestore only**.

## 2. Architecture

```
OSM/Overpass → discovery candidates → human review → curated dataset
            → dataset validation → Firebase Admin seeding → Firestore facilities
            → Lifeguard360 public facility search (unchanged)
```

Layers (and who owns them):

| Stage | Owner | File(s) |
|---|---|---|
| Query construction | tool (pure) | `facilityDiscovery/query.ts` |
| Overpass HTTP | tool (only network module) | `facilityDiscovery/overpass.ts` |
| Response parsing / candidate schema | tool (pure) | `facilityDiscovery/parse.ts` |
| Address composition | tool (pure) | `facilityDiscovery/address.ts` |
| Category suggestion | tool (advisory only) | `facilityDiscovery/categories.ts` |
| Duplicate flagging | tool (advisory only) | `facilityDiscovery/dedupe.ts` |
| Curated-data comparison | tool (read-only) | `facilityDiscovery/compare.ts` |
| Orchestration / output | CLI | `facilityDiscovery/cli.ts` |
| Verification & curation | **human** | `tools/facilities.*.json` |
| Production contract validation | seeder | `facilityValidation.ts` + `seedFacilities.ts` |

## 3. Prerequisites

Node 24+ (built-in `fetch`). No new packages — the tool uses the project's existing
dependencies only. No Firebase credentials are needed or used.

## 4. Configuration

`tools/discoveryConfig.json`:

```jsonc
{
  "regions": {
    "yola-jimeta": {
      "bbox": [8.85, 12.35, 9.65, 12.75],   // [south, west, north, east]
      "justification": "…"
    }
  },
  "overpass": {
    "endpoint": "https://overpass-api.de/api/interpreter",
    "timeoutMs": 25000,
    "retries": 1
  },
  "queryRef": "medical-v1"
}
```

- **region** — a named entry under `regions`. Regions come ONLY from this config;
  the CLI never accepts raw coordinates and rejects path-unsafe names.
- **bbox** — `[south, west, north, east]`; validated (ranges, south < north, west < east)
  before any request; never reordered.
- **endpoint** — Overpass interpreter URL.
- **timeoutMs** — per-attempt abort timeout (25 000 ms).
- **retries** — additional attempts after a retryable failure (1 ⇒ 2 attempts total).

## 5. Running discovery

```bash
# Full run: network request + analysis + writes tools/discovery/<region>/
npm run discover:facilities -- --region yola-jimeta

# Dry-run: network request + analysis + summary, NO files written
npm run discover:facilities -- --region yola-jimeta --dry-run
```

Exit codes: `0` success, `1` overpass/analysis/IO failure, `2` usage/configuration
error (no network request is made for usage errors).

## 6. Output files

Written ONLY to `tools/discovery/<region>/` (created if needed; existing output is
left untouched when a run fails at any earlier stage):

| File | Content |
|---|---|
| `candidates.json` | Parsed candidate records (sorted by `candidateId`), each annotated with its advisory `comparison` status. **No candidate carries `verified`.** |
| `duplicates.json` | Duplicate flags with type, both candidate ids, distance, and reason. Flags only — nothing is merged or removed. |
| `_run.json` | Run metadata: tool version, region, bbox, endpoint, queryRef, UTC `retrievedAt`, request info (UA, attempts, bytes), totals (elements / candidates / skipped / flags), comparison counts, and the structured skip list. The raw Overpass response is intentionally NOT stored. |

## 7. Human review workflow

1. Run discovery for a region.
2. Open `candidates.json` and review each candidate: identity (name/OSM URL),
   coordinates, category suggestion **vs. the preserved OSM tags**, phone/hours,
   address components.
3. Check `duplicates.json` — resolve flagged pairs deliberately (never automatically).
4. Cross-check the `comparison` annotation against `tools/facilities.yola.json`.
5. Verify each candidate against real evidence (official site, government directory,
   registry, the OSM element itself) and **manually author** a contract-valid record
   into the curated dataset with provenance per `DATASET-CONTRACT.md` §5.

**A discovered facility is NOT verified automatically. A candidate must be manually
reviewed and then deliberately promoted into the curated dataset.** The discovery
output is preparation data — it is never read by the application, the seeder, or
Firebase.

## 8. Address rules

`addressCandidate` is composed ONLY from actual OSM `addr:*` tags, most-specific-first
(`addr:housenumber, addr:street, addr:suburb, addr:city, addr:state, addr:postcode,
addr:country`). Missing components are skipped, never invented. No reverse geocoding,
no Nominatim, no coordinate-based address guessing — if OSM has no address, the
candidate address is `null`. Raw `addr:*` tags are preserved alongside the composed
string so reviewers can see the basis.

## 9. Deduplication rules

Duplicate detection produces **flags only**:

- `EXACT_OSM_IDENTITY` — the same OSM element appeared twice; canonical entry keeps
  the highest OSM version (flagged, both retained in the flag record).
- `POSSIBLE_SAME_SITE` — elements ≤ 25 m apart regardless of name (e.g. node + way
  of one campus).
- `PROBABLE_DUPLICATE` — same normalized name ≤ 50 m apart.
- `NAME_VARIANT` — same normalized name ≤ 150 m apart (possible rename/upgrade).

Name normalization (lowercase, punctuation/whitespace/diacritic folding) is used for
comparison only — candidate names are never modified. Candidates are never merged
or deleted; a human decides.

## 10. Overpass usage etiquette

Overpass is a free public service. Keep requests reasonable: bounded regions, the
configured 25 s timeout, at most 2 attempts, and no repeated unnecessary scans.
Do not schedule or loop discovery runs. One run per region per curation cycle is
the expected pattern.

## 11. Attribution

Discovery data originates from OpenStreetMap® (openstreetmap.org), licensed under the
Open Database License (ODbL). OSM data used for discovery should be attributed
appropriately ("© OpenStreetMap contributors"). The tool identifies itself honestly
to the Overpass service (`Lifeguard360-facility-discovery/0.1 (OpenStreetMap attribution)`)
and does not impersonate a browser.

## 12. Security boundary

The discovery tooling has **no Firebase access of any kind**:

- no `firebase-admin`, no Firebase client packages, no Firestore reads or writes
- no production mutation — the curated dataset is a read-only comparison input
- no application-service imports (`facilityService`, `seedFacilities` are never called)
- no runtime dependency for the public application — `src/**` never imports this tooling
- output is confined to `tools/discovery/<region>/` (path-safe region names only)

These boundaries are enforced by static-assertion tests (`safety.test.ts`).

---

# Part 2 — Runtime Facility Discovery (victim-facing, AD-13 spike)

Part 1 above is **developer/admin data acquisition**. This part defines the
**victim-facing runtime discovery layer**, which is a separate responsibility with
separate code. The Yola discovery CLI is never connected to the runtime search.

## R1. Two facility sources, one normalized model

```
Verified (trusted)                         Dynamic (untrusted)
  Lifeguard360 curated dataset               external runtime provider (future)
  persisted in Firestore                     overpass/OSM or commercial provider
  human-verified provenance                  machine-discovered, no verification
        ↓                                            ↓
  facilityService.findNearbyFacilities()      FacilityDiscoveryProvider
  (unchanged, AD-12 provider-agnostic)        (interface — adapter normalizes)
        ↓                                            ↓
  NearbyFacility { trust: "verified" }   →    NearbyFacility { trust: "dynamic" }
        └──────────────── combine → dedupe seam → app-computed distance → sort → UI ─┘
```

Implementation (contracts + service only; no provider integrated yet):

- `src/services/facilities/nearbyDiscoveryContracts.ts` — normalized model,
  provider interface, error model, validation helpers.
- `src/services/facilities/nearbyDiscoveryService.ts` — `searchNearbyFacilities()`:
  validates the query, runs the verified Firestore path, optionally invokes an
  injected provider, stamps trust at the service boundary, sorts nearest-first.

## R2. Explicit separations

| Rule | Meaning |
|---|---|
| **discovery ≠ verification** | A facility returned by any provider is a *candidate*, never verified data. Only the Lifeguard360 curated dataset (human-verified) yields `trust: "verified"`. |
| **dynamic ≠ verified** | Dynamic results carry `trust: "dynamic"` and `source.id: "dynamic-provider"`; the service stamps these — providers cannot claim verified status (test-pinned). |
| **discovery ≠ routing** | This layer returns facilities with distances. Turn-by-turn directions are a separate future concern and are NOT implemented here. Distance is not routing. |
| **Leaflet ≠ facility provider** | The map is a display layer for the normalized model; it never queries providers. |
| **CLI ≠ runtime service** | `tools/facilityDiscovery/` (Part 1) is data acquisition for humans. `nearbyDiscoveryService` is the runtime layer. They share no code paths. |

## R3. Provider contract & error model

Providers implement `FacilityDiscoveryProvider.searchNearby(query)` and return
**normalized** `NearbyFacility[]`. Adapter obligations (enforced by the service):

- derive stable ids from the provider's own identity (never runtime ordering);
- never assign trust or compute distance — the service stamps `trust` and
  recomputes `distanceMeters` from the user's actual fix via the shared haversine;
- never leak raw provider payloads — the normalized model is the only shape the
  application sees.

Failures normalize into `NearbyDiscoveryErrorCode` (`invalid-coordinates`,
`invalid-radius`, `provider-unavailable`, `provider-timeout`,
`provider-rate-limited`, `provider-malformed-response`,
`unexpected-provider-failure`). Provider-specific details (URLs, SDK messages,
status payloads) never reach the UI. A provider failure never discards verified
results — it is recorded in `diagnostics.errorsBySource` and surfaced as a note.
"No results" is a successful empty response, not an error.

## R4. Deduplication & distance boundaries

- **Distance** belongs to the application layer (`distanceMeters` in
  `@/utils/format`); provider-supplied distances are discarded.
- **Deduplication** has a named seam (`dedupeNearbyResults`) executed after
  verified + dynamic results are combined and before sorting. Its future
  implementation may compare coordinates, external IDs, names, types and
  proximity — but can never let a dynamic record upgrade a verified one. It is
  currently an identity pass-through (spike scope).

## R5. Security & trust boundary

- External dynamic facilities are **untrusted application data**.
- Dynamic facilities cannot automatically become verified; promotion happens only
  through human curation into the curated dataset (Part 1, §7).
- Provider responses must be normalized before reaching the UI; provider-specific
  fields must not leak across the application.
- No provider API secrets belong in client code; a future provider requiring
  protected credentials must proxy through a trusted backend.
- Firestore remains the trusted persistence layer for approved Lifeguard360 data;
  dynamic results are never persisted (no caching in this spike).

## R6. Current status

The spike ships contracts, the service pipeline, and 24 test-pinned behaviours.
No real provider is integrated and no network calls are made by this layer. The
next decision is the production dynamic provider (OSM/Overpass-runtime vs a
commercial API) and whether it needs a server proxy for credentials.
