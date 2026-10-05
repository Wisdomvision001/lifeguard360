import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from "firebase/firestore";

import { FIRST_AID_GUIDES } from "@/data/firstAid";
import { getDb } from "@/services/firebase/client";
import { describeFirebaseError, timestampToIso } from "@/services/firebase/db";
import {
  guideDocToGuide,
  guideToDoc,
  validateGuideForWrite,
} from "@/services/firstAid/guideContentCodec";
import type { EmergencyCategoryId, FirstAidGuide } from "@/types";

/**
 * Admin guide CMS (draft → validate → publish) against the reconciled
 * Firestore contract:
 *
 *   firstAidDrafts/{id}  — admin-only working copy; updatedAt server-set on
 *                          EVERY write (the rules reject client timestamps).
 *                          Publication state is which collection the document
 *                          lives in — a draft never carries publishedAt.
 *   firstAidGuides/{id}  — published copy; publishedAt server-set on create
 *                          and IMMUTABLE on update, so updates must never
 *                          mention publishedAt (updateDoc with the body only
 *                          leaves it untouched). Deletion is forbidden by
 *                          rules — withdraw by publishing a revision.
 *
 * Every write goes through validateGuideForWrite() first so the app never
 * sends a document it would refuse to read, and every failure is surfaced
 * with describeFirebaseError — never a fake success.
 */

export interface GuideOverviewEntry {
  id: EmergencyCategoryId;
  /** Draft label ?? published label ?? bundled label — the freshest truth. */
  label: string;
  hasDraft: boolean;
  hasPublished: boolean;
  draftUpdatedAt: string;
  publishedAt: string;
}

function guideIdOf(value: string): EmergencyCategoryId | null {
  return value in FIRST_AID_GUIDES ? (value as EmergencyCategoryId) : null;
}

/**
 * Publication state for every category. Reads both collections; requires the
 * admin claim for firstAidDrafts (rules reject everyone else honestly).
 */
export async function fetchGuideOverview(): Promise<GuideOverviewEntry[]> {
  try {
    const db = getDb();
    const [publishedSnap, draftSnap] = await Promise.all([
      getDocs(collection(db, "firstAidGuides")),
      getDocs(collection(db, "firstAidDrafts")),
    ]);

    const published = new Map<string, { data: Record<string, unknown>; iso: string }>();
    for (const snap of publishedSnap.docs) {
      published.set(snap.id, {
        data: snap.data() as Record<string, unknown>,
        iso: timestampToIso((snap.data() as Record<string, unknown>).publishedAt),
      });
    }
    const drafts = new Map<string, { data: Record<string, unknown>; iso: string }>();
    for (const snap of draftSnap.docs) {
      drafts.set(snap.id, {
        data: snap.data() as Record<string, unknown>,
        iso: timestampToIso((snap.data() as Record<string, unknown>).updatedAt),
      });
    }

    return Object.values(FIRST_AID_GUIDES).map((bundled) => {
      const publishedEntry = published.get(bundled.id);
      const draftEntry = drafts.get(bundled.id);
      const draftGuide = draftEntry ? guideDocToGuide(bundled.id, draftEntry.data) : null;
      const publishedGuide = publishedEntry
        ? guideDocToGuide(bundled.id, publishedEntry.data)
        : null;
      return {
        id: bundled.id,
        label: draftGuide?.label ?? publishedGuide?.label ?? bundled.label,
        hasDraft: draftEntry !== undefined,
        hasPublished: publishedEntry !== undefined,
        draftUpdatedAt: draftEntry?.iso ?? "",
        publishedAt: publishedEntry?.iso ?? "",
      };
    });
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

export interface LoadedDraft {
  /** null when no draft exists (start from published ?? bundled). */
  guide: FirstAidGuide | null;
  updatedAt: string;
}

/** Read one category's draft. A draft that fails the app model is an error. */
export async function fetchDraft(id: EmergencyCategoryId): Promise<LoadedDraft> {
  try {
    const snapshot = await getDoc(doc(getDb(), "firstAidDrafts", id));
    if (!snapshot.exists()) return { guide: null, updatedAt: "" };
    const data = snapshot.data() as Record<string, unknown>;
    const guide = guideDocToGuide(id, data);
    if (guide === null) {
      throw new Error(
        "The saved draft does not match the current content model. Discard it to return to the published content.",
      );
    }
    return { guide, updatedAt: timestampToIso(data.updatedAt) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not match")) throw error;
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/** Read every draft (admin) — used by the media usage index. */
export async function fetchAllDrafts(): Promise<Map<EmergencyCategoryId, FirstAidGuide>> {
  try {
    const snapshot = await getDocs(collection(getDb(), "firstAidDrafts"));
    const drafts = new Map<EmergencyCategoryId, FirstAidGuide>();
    for (const snap of snapshot.docs) {
      const id = guideIdOf(snap.id);
      if (id === null) continue;
      const guide = guideDocToGuide(id, snap.data());
      if (guide !== null) drafts.set(id, guide);
    }
    return drafts;
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/**
 * Save (create or replace) the working copy. The rules require updatedAt ==
 * request.time on every write — serverTimestamp() satisfies that; a rejected
 * write throws with the real reason so the editor keeps the user's work.
 */
export async function saveDraft(guide: FirstAidGuide): Promise<void> {
  const problem = validateGuideForWrite(guide);
  if (problem !== null) throw new Error(problem);
  try {
    await setDoc(doc(getDb(), "firstAidDrafts", guide.id), {
      ...guideToDoc(guide),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/** Discard the working copy — published/bundled content is untouched. */
export async function discardDraft(id: EmergencyCategoryId): Promise<void> {
  try {
    await deleteDoc(doc(getDb(), "firstAidDrafts", id));
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}

/**
 * Publish the guide: create the published document (publishedAt server-set)
 * or revise the existing one (publishedAt left untouched — the rules make it
 * immutable). Validation runs first; failure throws and changes nothing.
 */
export async function publishGuide(guide: FirstAidGuide): Promise<void> {
  const problem = validateGuideForWrite(guide);
  if (problem !== null) throw new Error(problem);
  try {
    const db = getDb();
    const guideRef = doc(db, "firstAidGuides", guide.id);
    const existing = await getDoc(guideRef);
    const body = guideToDoc(guide);
    if (existing.exists()) {
      // updateDoc keeps the stored publishedAt — mentioning it would be
      // rejected (immutable) and setting it to serverTimestamp() would be a
      // different value than the stored one.
      await updateDoc(guideRef, body as DocumentData);
    } else {
      await setDoc(guideRef, { ...body, publishedAt: serverTimestamp() });
    }
  } catch (error) {
    throw new Error(describeFirebaseError(error), { cause: error });
  }
}
