/**
 * Core domain types for Lifeguard360.
 * Keep in sync with firebase/firestore.rules — the rules are the authoritative
 * enforcement of everything modelled here.
 */

// ---------------------------------------------------------------- categories

/** The six fixed first-aid categories. Closed union — extensible only by deliberate schema change. */
export type EmergencyCategoryId =
  "burns" | "bleeding" | "choking" | "snake-bite" | "road-accident" | "fractures";

export const EMERGENCY_CATEGORY_IDS: readonly EmergencyCategoryId[] = [
  "burns",
  "bleeding",
  "choking",
  "snake-bite",
  "road-accident",
  "fractures",
] as const;

export function isEmergencyCategoryId(value: string): value is EmergencyCategoryId {
  return (EMERGENCY_CATEGORY_IDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------- first aid

/** Lifecycle of a first-aid guide version. Users only ever consume `published`. */
export type ReviewStatus = "draft" | "in-review" | "approved" | "published";

export interface GuideProvenance {
  /** The claim/instruction this source backs. */
  claim: string;
  /** Verified source (e.g. "St John Ambulance first-aid advice"). */
  source: string;
  /** ISO date the source was verified. */
  verifiedAt: string;
}

/** One structured step inside a guide's canonical protocol. */
export interface GuideStep {
  title: string;
  /** The instruction. This is the text read aloud by TTS. */
  text: string;
  /** Local asset path (public/images) when a step-level image exists. */
  image?: string;
  imageAlt?: string;
  /** Safety-critical caution attached to this step. */
  warning?: string;
}

/**
 * Educational video metadata. Playback integration is a later task: no video
 * assets are bundled, nothing is downloaded, and embed availability must be
 * confirmed before any provider value other than "local" is used.
 */
export interface GuideVideo {
  src: string;
  provider: "local" | "youtube" | "vimeo";
  title: string;
  durationSeconds?: number;
  thumbnail: string;
  attribution: string;
  license: string;
}

/**
 * Compressed memory-aid presentation of the canonical protocol.
 * Stored explicitly per category — never runtime-summarised — so a reviewer
 * can inspect it beside content.steps and verify it introduces no different
 * medical advice (Quick Guide is a presentation of the one protocol).
 */
export interface QuickGuide {
  immediatePriority: string;
  essentialActions: string[];
  criticalDonts: string[];
}

/**
 * A clearly labelled protocol variation (e.g. "baby under 1" for choking,
 * "chemical burn" for burns). Serializable and presentation-independent;
 * the variant UI is a later task, so no bundled guide populates this yet.
 */
export interface GuideVariant {
  id: string;
  label: string;
  steps: GuideStep[];
}

/** An immutable published version of a first-aid guide. */
export interface FirstAidGuideVersion {
  id: string;
  contentVersion: string;
  summary: string;
  /** Canonical protocol — structured steps; `text` is the speakable instruction. */
  steps: GuideStep[];
  dos: string[];
  donts: string[];
  whenToSeekHelp: string[];
  /** Compressed memory-aid view of the same protocol (see QuickGuide). */
  quickGuide: QuickGuide;
  /** Labelled protocol variants; left unset until variant content is authored. */
  variants?: GuideVariant[];
  /** Educational video metadata, when one exists. No videos are bundled yet. */
  video?: GuideVideo;
  reviewStatus: Extract<ReviewStatus, "published">;
  reviewedBy?: string;
  reviewedAt?: string;
  provenance: GuideProvenance[];
  publishedAt: string;
}

/** The published (current) view of a guide as served to users. */
export interface FirstAidGuide {
  id: EmergencyCategoryId;
  label: string;
  summary: string;
  iconClass: string;
  /** Local photographic imagery for cards/banners (public/images). */
  image?: string;
  /** Static per-category fallback content bundled with the app. */
  content: Omit<FirstAidGuideVersion, "id" | "reviewStatus" | "publishedAt">;
}

// ---------------------------------------------------------------- users

export interface UserProfile {
  uid: string;
  displayName: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  language: string;
  ttsEnabled: boolean;
  /** Whether the user has acknowledged the communication preconditions notice. */
  commsNoticeAcknowledged: boolean;
}

export const CONTACT_RELATIONSHIPS = [
  "Parent",
  "Sibling",
  "Spouse",
  "Friend",
  "Guardian",
  "Other",
] as const;

export type ContactRelationship = (typeof CONTACT_RELATIONSHIPS)[number];

export interface EmergencyContact {
  id: string;
  fullName: string;
  relationship: ContactRelationship;
  /** E.164-formatted phone number, e.g. +2348012345678. */
  phoneNumber: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- activity

export const ACTIVITY_TYPES = [
  "contact_added",
  "contact_updated",
  "contact_deleted",
  "location_shared",
  "emergency_action",
  "offline_download",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Minimal, purpose-bound detail attached to an activity record (data minimisation). */
export interface ActivityRecord {
  id: string;
  type: ActivityType;
  /** e.g. { contactId, action: "sms_prepared" } or { coordinates: {lat, lng} }. */
  detail: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------- location

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

/** A one-shot location fix. Never a tracking stream. */
export interface LocationFix {
  coordinates: GeoCoordinates;
  /** metres */
  accuracy: number;
  /** epoch ms — freshness is judged against this. */
  timestamp: number;
  /**
   * Best-effort acquisition source. The browser does NOT reliably tell us
   * whether a fix is GPS- or network-derived, so this stays honest: when it
   * cannot be determined it is "unknown", never a guess.
   */
  source?: LocationSource;
  /** Accuracy-band classification of this fix (see classifyAccuracy). */
  quality?: LocationQuality;
}

/** Honest acquisition-source label — "unknown" when the platform cannot say. */
export type LocationSource = "gps" | "network" | "unknown";

/** Accuracy bands (metres): <20 excellent · ≤50 good · ≤100 acceptable · ≤500 poor · >500 critical. */
export type LocationQuality = "excellent" | "good" | "acceptable" | "poor" | "critical";

export type LocationPermissionState =
  "idle" | "unsupported" | "requesting" | "granted" | "denied" | "unavailable" | "invalid";

// ---------------------------------------------------------------- facilities

export interface Facility {
  id: string;
  name: string;
  category: string;
  coordinates: GeoCoordinates;
  phone?: string;
  openingHours?: string;
  verified: boolean;
  /** Where this record came from — required for honest attribution. */
  source: string;
  updatedAt: string;
}

export interface FacilityWithDistance extends Facility {
  distanceMeters: number;
}

// ---------------------------------------------------------------- offline

export interface OfflinePackageMeta {
  version: string;
  downloadedAt: string;
  categories: EmergencyCategoryId[];
}

// ---------------------------------------------------------------- communication

/**
 * Communication state semantics (AD-7): the app can only witness its own
 * actions. "sent" and "delivered" are NEVER claimable states.
 */
export type CommunicationState =
  "action-available" | "preparing" | "message-prepared" | "composer-opened" | "unavailable";

export interface PreparedSms {
  state: Extract<CommunicationState, "message-prepared" | "composer-opened" | "unavailable">;
  to: string;
  body: string;
}

// ---------------------------------------------------------------- i18n

export type SupportedLocale = "en" | "ha" | "yo" | "ig" | "pcm";
