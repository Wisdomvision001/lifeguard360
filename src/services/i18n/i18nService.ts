import type { SupportedLocale } from "@/types";

/**
 * I18nService (Phase 9): human-reviewed UI strings only. Medical content is
 * NEVER machine-translated — translated guides appear only after review
 * (AD-14); until then guides render in English everywhere.
 */

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "ha", "yo", "ig", "pcm"];

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
  pcm: "Nigerian Pidgin",
};

type Dict = Record<string, string>;

/** English is the source of truth; other locales ship only reviewed strings. */
const Dictionaries: Record<SupportedLocale, Dict> = {
  en: {
    "nav.home": "Home",
    "nav.firstAid": "First Aid",
    "nav.getHelp": "Get Help Now",
    "nav.facilities": "Find Healthcare Facilities",
    "nav.contacts": "Emergency Contacts",
    "nav.activity": "Activity History",
    "nav.profile": "Profile",
    "nav.offline": "Offline First Aid",
  },
  ha: {},
  yo: {},
  ig: {},
  pcm: {},
};

const STORAGE_KEY = "lifeguard360.locale";

export function getStoredLocale(): SupportedLocale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as SupportedLocale;
    }
  } catch {
    // fall through to default
  }
  return "en";
}

export function storeLocale(locale: SupportedLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Preference is non-essential; ignore storage failures.
  }
}

export function translate(locale: SupportedLocale, key: string): string {
  return Dictionaries[locale][key] ?? Dictionaries.en[key] ?? key;
}

/** True when the locale has a reviewed dictionary. */
export function isLocaleReviewed(locale: SupportedLocale): boolean {
  return Object.keys(Dictionaries[locale]).length > 0;
}
