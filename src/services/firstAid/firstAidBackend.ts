import { collection, getDocs } from "firebase/firestore";

import { isEmergencyCategoryId, type FirstAidGuide } from "@/types";
import { getDb } from "@/services/firebase/client";
import { guideDocToGuide } from "@/services/firstAid/guideContentCodec";

/**
 * Published first-aid content from Firestore (the CMS read path).
 *
 * fetchPublishedGuides() performs ONE public read of firstAidGuides and
 * returns only documents that pass the application-model codec. It THROWS on
 * Firestore failures so callers can tell "backend unavailable" apart from
 * "nothing published yet" and keep serving the bundled fallback honestly.
 * The public app must never surface an error for this: bundled content stays
 * valid either way (see FirstAidContentProvider).
 */
export async function fetchPublishedGuides(): Promise<FirstAidGuide[]> {
  const snapshot = await getDocs(collection(getDb(), "firstAidGuides"));
  const guides: FirstAidGuide[] = [];
  for (const docSnap of snapshot.docs) {
    if (!isEmergencyCategoryId(docSnap.id)) continue;
    const guide = guideDocToGuide(docSnap.id, docSnap.data());
    if (guide !== null) {
      guides.push(guide);
    }
  }
  return guides;
}
