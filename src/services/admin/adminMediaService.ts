import { doc, updateDoc, type DocumentData } from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  listAll,
  ref,
  uploadBytes,
} from "firebase/storage";

import { FIRST_AID_GUIDES } from "@/data/firstAid";
import { fetchAllDrafts, saveDraft } from "@/services/admin/adminGuideService";
import { getDb, getStorageInstance } from "@/services/firebase/client";
import { describeFirebaseError } from "@/services/firebase/db";
import { fetchPublishedGuides } from "@/services/firstAid/firstAidBackend";
import { guideToDoc } from "@/services/firstAid/guideContentCodec";
import type { FirstAidGuide } from "@/types";

/**
 * Admin media service — REAL Firebase Storage operations for the CMS.
 *
 * Contract mirrored from firebase/storage.rules:
 *   - public read on images/** ; writes require the admin custom claim;
 *   - ≤ 5 MB, content type must be image/(png|jpeg|webp|gif).
 * Validation here is UX early-warning; the rules remain the boundary.
 *
 * Reference integrity: guides reference media by download URL. Delete
 * refuses files that are still referenced, and Replace rewrites every
 * reference (drafts AND published) to the new URL BEFORE removing the old
 * object, so a mid-flow failure can never leave the app pointing at a
 * deleted file.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export interface MediaItem {
  /** Full Storage path, e.g. images/guides/burns/1712…-hero.png */
  path: string;
  /** File name within its folder. */
  name: string;
  contentType: string;
  sizeBytes: number;
  /** ISO timestamp of the last upload to this object. */
  updatedAt: string;
  /** Stable download URL (what guide documents store). */
  url: string;
}

/** url → human-readable references, e.g. "Burns — step 2 “Cool the burn”". */
export type MediaUsageIndex = Map<string, string[]>;

// --------------------------------------------------------------- validation

/**
 * Client-side early validation mirroring the Storage rules. Returns an
 * honest problem message, or null when the file may be uploaded.
 */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `“${file.name}” is not a supported image type. Choose a PNG, JPEG, WebP or GIF file.`;
  }
  if (file.size === 0) {
    return `“${file.name}” is empty — choose a file with image data.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `“${file.name}” is ${formatMegabytes(file.size)} — the limit is ${formatMegabytes(MAX_IMAGE_BYTES)}.`;
  }
  return null;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function storageFileName(file: File): string {
  const base =
    file.name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";
  return `${Date.now()}-${base}`;
}

// ------------------------------------------------------------------- upload

/**
 * Upload one validated file and return its Storage path + download URL.
 * The URL is obtained only AFTER the upload succeeds — nothing is written to
 * Firestore by this function, so callers stay in control of the order.
 */
export async function uploadImage(
  file: File,
  folder: string,
): Promise<{ path: string; url: string }> {
  const problem = validateImageFile(file);
  if (problem !== null) throw new Error(problem);
  try {
    const path = `${folder.replace(/\/+$/, "")}/${storageFileName(file)}`;
    const objectRef = ref(getStorageInstance(), path);
    await uploadBytes(objectRef, file, { contentType: file.type });
    const url = await getDownloadURL(objectRef);
    return { path, url };
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

// ------------------------------------------------------------------ listing

function isoFromUnknown(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string" && value !== "") return new Date(value).toISOString();
  return "";
}

/** The actual objects under images/** — never fabricated entries. */
export async function listMediaItems(): Promise<MediaItem[]> {
  try {
    const listed = await listAll(ref(getStorageInstance(), "images"));
    const items = await Promise.all(
      listed.items.map(async (objectRef): Promise<MediaItem> => {
        const [metadata, url] = await Promise.all([getMetadata(objectRef), getDownloadURL(objectRef)]);
        return {
          path: objectRef.fullPath,
          name: objectRef.name,
          contentType: metadata.contentType ?? "application/octet-stream",
          sizeBytes: metadata.size,
          updatedAt: isoFromUnknown(metadata.updated),
          url,
        };
      }),
    );
    return items.sort((a, b) => a.path.localeCompare(b.path));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

// -------------------------------------------------------------------- usage

/**
 * Index every Storage URL currently referenced by published guides or
 * drafts (bundled assets are local paths, never Storage URLs). Used by the
 * Media page to show what each file is for and to guard deletes.
 */
export async function buildMediaUsageIndex(): Promise<MediaUsageIndex> {
  const [published, drafts] = await Promise.all([fetchPublishedGuides(), fetchAllDrafts()]);
  const index: MediaUsageIndex = new Map();
  const add = (url: string | undefined, label: string): void => {
    if (url === undefined || url === "") return;
    const existing = index.get(url);
    if (existing) existing.push(label);
    else index.set(url, [label]);
  };
  for (const guide of published) {
    add(guide.image, `${guide.label} guide banner`);
    guide.content.steps.forEach((step, position) => {
      add(step.image, `${guide.label} — step ${position + 1} “${step.title}”`);
    });
  }
  for (const guide of drafts.values()) {
    add(guide.image, `Draft: ${guide.label} guide banner`);
    guide.content.steps.forEach((step, position) => {
      add(step.image, `Draft: ${guide.label} — step ${position + 1} “${step.title}”`);
    });
  }
  return index;
}

// ------------------------------------------------------------------- delete

/**
 * Delete an object ONLY when no guide or draft references it. Storage rules
 * permit admin deletes; content integrity forbids orphaning live references.
 */
export async function deleteMediaItem(item: MediaItem): Promise<void> {
  const usage = await buildMediaUsageIndex();
  const references = usage.get(item.url) ?? [];
  if (references.length > 0) {
    throw new Error(
      `This file is still used by ${references.join("; ")}. Remove the image in the guide editor first, then delete the file.`,
    );
  }
  try {
    await deleteObject(ref(getStorageInstance(), item.path));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

// ------------------------------------------------------------------ replace

function swapImageRefs(
  guide: FirstAidGuide,
  from: string,
  to: string,
): FirstAidGuide | null {
  const stepsChanged = guide.content.steps.some((step) => step.image === from);
  const imageChanged = guide.image === from;
  if (!stepsChanged && !imageChanged) return null;
  return {
    ...guide,
    ...(imageChanged ? { image: to } : {}),
    content: {
      ...guide.content,
      steps: guide.content.steps.map((step) =>
        step.image === from ? { ...step, image: to } : step,
      ),
    },
  };
}

/**
 * Replace an object's bytes with a new file while keeping every reference
 * alive:
 *
 *   1. upload the new file (new object, new URL) — old object untouched;
 *   2. rewrite ALL references (drafts and published guides) to the new URL;
 *   3. only then delete the old object.
 *
 * A failure at any step leaves the app fully working: references still point
 * at existing objects (step 1/2 failure) or the old file simply remains as a
 * deletable leftover (step 3 failure).
 */
export async function replaceMediaItem(item: MediaItem, file: File): Promise<MediaItem> {
  const folder = item.path.includes("/")
    ? item.path.slice(0, item.path.lastIndexOf("/"))
    : "images";
  const uploaded = await uploadImage(file, folder);
  try {
    const [published, drafts] = await Promise.all([fetchPublishedGuides(), fetchAllDrafts()]);
    const db = getDb();
    for (const guide of published) {
      const swapped = swapImageRefs(guide, item.url, uploaded.url);
      if (swapped === null) continue;
      await updateDoc(doc(db, "firstAidGuides", guide.id), guideToDoc(swapped) as DocumentData);
    }
    for (const guide of drafts.values()) {
      const swapped = swapImageRefs(guide, item.url, uploaded.url);
      if (swapped === null) continue;
      await saveDraft(swapped);
    }
    await deleteObject(ref(getStorageInstance(), item.path));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
  return {
    path: uploaded.path,
    name: uploaded.path.slice(uploaded.path.lastIndexOf("/") + 1),
    contentType: file.type,
    sizeBytes: file.size,
    updatedAt: new Date().toISOString(),
    url: uploaded.url,
  };
}

/** Bundled asset references (local public/images paths) for the read-only section. */
export interface BundledMediaItem {
  id: string;
  path: string;
  usage: string;
}

export function collectBundledMedia(): BundledMediaItem[] {
  const items: BundledMediaItem[] = [];
  for (const guide of Object.values(FIRST_AID_GUIDES)) {
    if (guide.image !== undefined) {
      items.push({
        id: `${guide.id}-main`,
        path: guide.image,
        usage: `${guide.label} guide banner`,
      });
    }
    guide.content.steps.forEach((step, index) => {
      if (step.image !== undefined) {
        items.push({
          id: `${guide.id}-step-${index}`,
          path: step.image,
          usage: `${guide.label} — step ${index + 1} “${step.title}”`,
        });
      }
    });
  }
  return items;
}
