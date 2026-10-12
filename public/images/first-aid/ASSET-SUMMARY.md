# ZIP Inspection Summary

Source: `First aid.zip` from the desktop.
Extract: `tmp/from-zip/First aid`.
Raw copy preserved under `public/images/first-aid/raw/unverified/`.

## Totals
- 67 image files total.
- 6 standalone JPGs in the root of the ZIP.
- 9 files in the `Burns/` subfolder.
- 52 files prefixed `Screenshot_20261011-...`.

## What we inspected
For every file we recorded:
- pixel dimensions,
- JPEG format,
- dominant colors at low resolution,
- a coarse ASCII/content map of the image,
- per-row dark-pixel distribution for the Burns folder images,
- and for the six standalone images we also printed a finer color grid through the top of the frame.

## Findings we are confident about
- The 52 `Screenshot_*` files are phone screenshots. Every one is exactly 720x1612, the same aspect and size as an Android portrait screenshot. Their content maps are dominated by a large mostly-empty UI frame with UI chrome across the top and bottom and only a small content region in the middle. Several have a green-ish or gray content area consistent with a phone screen. These are not instructional illustrations and were not moved into any first-aid category folder. They were copied into `public/images/first-aid/safety-first/` only as a readable archive of what was actually provided; they are not wired into any guide.
- The 6 standalone images are 636x914, 720x1008, 652x1010, 656x1094, 656x1132, and 704x954. Their tops are mostly white, followed by a darker content region, then a long mostly-empty lower band. Their content maps are consistent with portrait document-style images: dense text-like content in some regions, mixed color blocks in others, and a hard light-to-dark transition near the top edge in some of them. They look like cropped page/document photos more than clean illustrations.
- In the Burns folder:
  - `bju.jpeg` and `WhatsApp I.jpeg` are byte-identical in size and have nearly identical color profiles and content maps, so they are almost certainly the same image duplicated under different names.
  - `jm.jpeg` and `kk.jpeg` are also very close to each other in size and content map.
  - `WhatsApp Image 2026-10-11 at 11.12.48 PM.jpeg` is much smaller (612x464) and its content map is a sparse, centered, low-detail region with very little dark content overall.
  - `WhatsApp Image 2026-10-11 at 11.12.49 PM.jpeg` has a long narrow dark vertical band in the upper-middle and otherwise sparse content.
  - `gnjhv.jpeg`, `gvyjkhf.jpeg`, and `jhh.jpeg` each have sparse, irregular dark shapes rather than dense instructional layout.
  - None of the Burns images had a clearly clinical burn-care illustration laid out in the coarse inspection. Several appear posterish or photo/poster-like with a lot of white space, gradients, and decorative color bands.

## What we did NOT verify and cannot assert
- We did not confirm what any of these images actually depict factually. The color/ASCII analysis supported our classification of screenshots vs. document-style images, but it does not replace visual confirmation of medical content.
- We did not confirm the license, attribution, or reuse rights for any of these files. That must come from the source you collected them from.
- We did not identify which Burns image, if any, correctly illustrates the existing burns steps in `src/data/firstAid.ts`.
- We did not identify which standalone image, if any, correctly illustrates burns, bleeding, choking, snake bite, road accident, fractures, or CPR.

## Current placement
- Screenshots: `public/images/first-aid/safety-first/` (archive only, not integrated).
- Raw originals: `public/images/first-aid/raw/unverified/` (preserved unchanged).
- Category folders `burns`, `bleeding`, `choking`, `cpr`, `fractures`, `road-accident`, `snake-bite` exist but only the previously integrated files are in them; nothing from the ZIP was placed into a category folder yet.

## Blockers for integration
- No image in this ZIP was verified as medically accurate for any guide step.
- No image in this ZIP had confirmed reuse permission.
- The Burns folder contained duplicated/near-duplicated files and several sparse or poster-style images, none of which we could confidently map to a specific burns step without visual confirmation.
- Road-accident illustrations were not present in the ZIP.

## Recommended next step
Review the preserved raw images with the person who collected them and:
1. Confirm which ones are actual first-aid illustrations and which are screenshots, duplicates, or unrelated captures.
2. Confirm the license and attribution for each reusable image.
3. Decide which Burns image, if any, matches the existing burns steps, and which standalone images match any other steps.
4. Only then crop/optimize the confirmed ones and wire them into the correct steps.
